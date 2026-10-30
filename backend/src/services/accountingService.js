const mongoose = require('mongoose');
const InstallmentPlan = require('../models/InstallmentPlan');
const FundingAllocation = require('../models/FundingAllocation');
const ProfitDistribution = require('../models/ProfitDistribution');
const Withdrawal = require('../models/Withdrawal');
const InvestorTransaction = require('../models/InvestorTransaction');
const OwnerTransaction = require('../models/OwnerTransaction');
const Investor = require('../models/Investor');

/**
 * Returns this contract's investor-side funding breakdown, in order of preference:
 *   1. Explicit FundingAllocation rows (multi-source: Owner + one or more Investors)
 *   2. The plan's simple single-investor fields (fundingSource/investorId/capitalDeployed)
 * This keeps old, simple single-investor contracts working unchanged while allowing
 * new contracts to use full multi-source allocation.
 */
async function getContractFunding(plan) {
  const allocations = await FundingAllocation.find({ planId: plan._id });
  if (allocations.length > 0) {
    const investorRows = allocations.filter((a) => a.sourceType === 'INVESTOR');
    const ownerRows = allocations.filter((a) => a.sourceType === 'OWNER');
    const totalInvestorFunding = investorRows.reduce((s, a) => s + a.amount, 0);
    const totalOwnerFunding = ownerRows.reduce((s, a) => s + a.amount, 0);
    return {
      investorRows: investorRows.map((a) => ({ investorId: a.investorId, amount: a.amount })),
      totalInvestorFunding,
      totalOwnerFunding,
    };
  }

  if (plan.fundingSource === 'INVESTOR' && plan.investorId) {
    return {
      investorRows: [{ investorId: plan.investorId, amount: plan.capitalDeployed }],
      totalInvestorFunding: plan.capitalDeployed,
      totalOwnerFunding: 0,
    };
  }

  // BUSINESS-funded contract — no investor involvement, no profit split applies.
  return { investorRows: [], totalInvestorFunding: 0, totalOwnerFunding: plan.purchaseCost };
}

/**
 * Calculates capital recovery on a contract under the Profit-First method.
 * Profit is recognized first up to totalExpectedProfit.
 * Any cash collected beyond totalExpectedProfit recovers capital, up to purchaseCost.
 * Distributes recovered capital proportionally to the funding sources (Owner and Investors).
 */
function getContractCapitalRecovery(plan, funding) {
  const purchaseCost = Math.max(0, plan.purchaseCost || 0);
  const sellingPrice = Math.max(0, plan.sellingPrice || 0);
  const totalExpectedProfit = Math.max(0, sellingPrice - purchaseCost);
  const totalCollected = (plan.downPayment || 0) + (plan.totalPaid || 0);

  const purchaseCostPaisa = Math.round(purchaseCost * 100);
  const expectedProfitPaisa = Math.round(totalExpectedProfit * 100);
  const collectedPaisa = Math.round(totalCollected * 100);

  // Capital recovery begins only after totalExpectedProfit has been collected
  const recoveredCapitalPaisa = Math.min(
    purchaseCostPaisa,
    Math.max(0, collectedPaisa - expectedProfitPaisa)
  );
  const recoveredCapital = recoveredCapitalPaisa / 100;
  const capitalStillDeployed = round2(Math.max(0, (purchaseCostPaisa - recoveredCapitalPaisa) / 100));

  const totalFundingPaisa =
    Math.round(((funding.totalInvestorFunding || 0) + (funding.totalOwnerFunding || 0)) * 100) || purchaseCostPaisa;
  const ownerFundingPaisa = Math.round((funding.totalOwnerFunding || 0) * 100);
  const investorFundingPaisa = Math.round((funding.totalInvestorFunding || 0) * 100);

  const ownerRecoveredPaisa =
    totalFundingPaisa > 0 ? Math.round(recoveredCapitalPaisa * (ownerFundingPaisa / totalFundingPaisa)) : 0;
  const investorRecoveredPaisa = Math.max(0, recoveredCapitalPaisa - ownerRecoveredPaisa);

  let allocatedInvestorRecoveredPaisa = 0;
  const investorShares = (funding.investorRows || []).map((row, index) => {
    const rowFundingPaisa = Math.round((row.amount || 0) * 100);
    const shareRatio = investorFundingPaisa > 0 ? rowFundingPaisa / investorFundingPaisa : 0;

    let rowRecoveredPaisa;
    if (index === funding.investorRows.length - 1) {
      rowRecoveredPaisa = Math.max(0, investorRecoveredPaisa - allocatedInvestorRecoveredPaisa);
    } else {
      rowRecoveredPaisa = Math.round(investorRecoveredPaisa * shareRatio);
      allocatedInvestorRecoveredPaisa += rowRecoveredPaisa;
    }

    const rowRecovered = rowRecoveredPaisa / 100;
    const rowStillDeployed = round2(Math.max(0, (rowFundingPaisa - rowRecoveredPaisa) / 100));

    return {
      investorId: row.investorId,
      fundedAmount: row.amount,
      recoveredCapital: rowRecovered,
      capitalStillDeployed: rowStillDeployed,
    };
  });

  return {
    purchaseCost,
    totalCollected,
    totalExpectedProfit,
    recoveredCapital,
    capitalStillDeployed,
    ownerRecoveredCapital: ownerRecoveredPaisa / 100,
    ownerCapitalStillDeployed: round2(Math.max(0, (ownerFundingPaisa - ownerRecoveredPaisa) / 100)),
    investorRecoveredCapital: investorRecoveredPaisa / 100,
    investorShares,
  };
}

/**
 * Recalculates and stores the ProfitDistribution snapshot for a contract.
 * See ProfitDistribution model for the documented realization + split formulas.
 * Only contracts with at least one investor funding row produce a distribution —
 * a fully business/owner-funded contract has no 50/50 split to record.
 */
async function calculateProfitDistribution(planId) {
  const plan = await InstallmentPlan.findById(planId);
  if (!plan) throw Object.assign(new Error('Contract not found.'), { statusCode: 404 });

  const funding = await getContractFunding(plan);
  if (funding.totalInvestorFunding <= 0) {
    // Nothing investor-funded on this contract — remove any stale distribution and stop.
    await ProfitDistribution.deleteOne({ planId: plan._id });
    return null;
  }

  const totalExpectedProfit = Math.max(0, plan.expectedProfit); // losses are never "distributed"
  const totalCollected = (plan.downPayment || 0) + (plan.totalPaid || 0);
  const sellingPrice = plan.sellingPrice;

  // Profit-First Cash Allocation Method:
  // Recognize profit immediately from the first rupees collected (down payment + payments)
  // up to the total expected profit. Once total expected profit is reached, all remaining
  // cash collected represents recovered capital.
  const expectedProfitPaisa = Math.round(totalExpectedProfit * 100);
  const collectedPaisa = Math.round(totalCollected * 100);
  const realizedProfitPaisa = Math.max(0, Math.min(expectedProfitPaisa, collectedPaisa));
  const realizedProfit = realizedProfitPaisa / 100;

  // 50% Owner and 50% Investors split of realized profit
  const ownerProfitPaisa = Math.round(realizedProfitPaisa * 0.5);
  const investorProfitPoolPaisa = realizedProfitPaisa - ownerProfitPaisa; // absorbs any odd 1-paisa

  const ownerProfit = ownerProfitPaisa / 100;
  const investorProfitPool = investorProfitPoolPaisa / 100;

  const totalInvestorFundingPaisa = funding.investorRows.reduce(
    (sum, r) => sum + Math.round((r.amount || 0) * 100),
    0
  );

  const recovery = getContractCapitalRecovery(plan, funding);
  const recoveryMap = new Map(recovery.investorShares.map((r) => [String(r.investorId), r]));

  let allocatedInvestorProfitPaisa = 0;
  const investorShares = funding.investorRows.map((row, index) => {
    const rowFundingPaisa = Math.round((row.amount || 0) * 100);
    const shareRatio = totalInvestorFundingPaisa > 0 ? rowFundingPaisa / totalInvestorFundingPaisa : 0;

    // Proportional division of the investor pool in integer paisa
    let rowProfitSharePaisa;
    if (index === funding.investorRows.length - 1) {
      // Last investor absorbs any rounding remainder
      rowProfitSharePaisa = Math.max(0, investorProfitPoolPaisa - allocatedInvestorProfitPaisa);
    } else {
      rowProfitSharePaisa = Math.round(investorProfitPoolPaisa * shareRatio);
      allocatedInvestorProfitPaisa += rowProfitSharePaisa;
    }

    const rec = recoveryMap.get(String(row.investorId));

    return {
      investorId: row.investorId,
      fundedAmount: row.amount,
      fundedSharePercent: Math.round(shareRatio * 10000) / 100, // e.g. 50.00
      profitShare: rowProfitSharePaisa / 100,
      recoveredCapital: rec ? rec.recoveredCapital : 0,
      capitalStillDeployed: rec ? rec.capitalStillDeployed : row.amount,
    };
  });

  const distribution = await ProfitDistribution.findOneAndUpdate(
    { planId: plan._id },
    {
      planId: plan._id,
      totalExpectedProfit,
      totalCollected,
      sellingPrice,
      realizedProfit,
      ownerProfit,
      investorProfitPool,
      investorShares,
      recoveredCapital: recovery.recoveredCapital,
      ownerRecoveredCapital: recovery.ownerRecoveredCapital,
      investorRecoveredCapital: recovery.investorRecoveredCapital,
      capitalStillDeployed: recovery.capitalStillDeployed,
      calculatedAt: new Date(),
    },
    { upsert: true, new: true }
  );

  return distribution;
}

/** Recalculates profit distribution for every investor-funded contract belonging to one investor. */
async function recalculateAllForInvestor(investorId) {
  const plans = await InstallmentPlan.find({
    $or: [{ investorId }, { _id: { $in: await FundingAllocation.distinct('planId', { investorId }) } }],
  });
  await Promise.all(plans.map((p) => calculateProfitDistribution(p._id)));
}

/**
 * Aggregates one investor's total realized profit, their 50% share, the owner's
 * 50% share attributable to that investor's contracts, and how much of each has
 * already been withdrawn or transferred to capital.
 *
 * FIX: Now counts InvestorTransaction records (PROFIT_WITHDRAWAL + PROFIT_TO_CAPITAL)
 * as the source of truth for investor withdrawals, since processWithdrawal already
 * creates InvestorTransaction(PROFIT_WITHDRAWAL) paired with Withdrawal records.
 * New standalone withdrawals also create InvestorTransaction records, so this single
 * source covers both old and new flows without double-counting.
 *
 * For the owner side: OwnerTransaction(OWNER_WITHDRAWAL + OWNER_PROFIT_TO_CAPITAL)
 * are the source of truth.
 */
async function getInvestorProfitSummary(investorId) {
  const investorObjectId =
    typeof investorId === 'string' && mongoose.Types.ObjectId.isValid(investorId)
      ? new mongoose.Types.ObjectId(investorId)
      : investorId;

  const planIds = [
    ...(await InstallmentPlan.find({ investorId }).distinct('_id')),
    ...(await FundingAllocation.distinct('planId', { investorId })),
  ];
  const uniquePlanIds = [...new Set(planIds.map(String))];

  const distributions = await ProfitDistribution.find({ planId: { $in: uniquePlanIds } });

  let totalProfitGenerated = 0;
  let investorProfitShare = 0;
  let ownerProfitShare = 0;

  distributions.forEach((d) => {
    const mine = d.investorShares.find((s) => String(s.investorId) === String(investorId));
    if (mine) {
      investorProfitShare += mine.profitShare;
      // In the 50/50 model, Owner's paired share attributable to this investor
      // equals the investor's share, preventing multi-investor double-counting across the portfolio.
      ownerProfitShare += mine.profitShare;
      totalProfitGenerated += mine.profitShare * 2;
    }
  });

  // FIX: Use InvestorTransaction records as the single source of truth for investor
  // withdrawals. processWithdrawal already creates InvestorTransaction(PROFIT_WITHDRAWAL)
  // so old records are covered; new standalone flows also create InvestorTransaction records.
  const investorTxAgg = await InvestorTransaction.aggregate([
    { $match: { investorId: investorObjectId, transactionType: { $in: ['PROFIT_WITHDRAWAL', 'PROFIT_TO_CAPITAL'] } } },
    { $group: { _id: '$transactionType', total: { $sum: '$amount' } } },
  ]);
  const investorProfitCashWithdrawn = round2(investorTxAgg.find((t) => t._id === 'PROFIT_WITHDRAWAL')?.total || 0);
  const investorProfitToCapital = round2(investorTxAgg.find((t) => t._id === 'PROFIT_TO_CAPITAL')?.total || 0);
  const investorWithdrawn = round2(investorProfitCashWithdrawn + investorProfitToCapital);

  // FIX: Use OwnerTransaction records as source of truth for owner withdrawals
  // (OWNER_WITHDRAWAL from old processWithdrawal + new standalone flows + OWNER_PROFIT_TO_CAPITAL).
  const ownerTxAgg = await OwnerTransaction.aggregate([
    {
      $match: {
        investorId: investorObjectId,
        transactionType: { $in: ['OWNER_WITHDRAWAL', 'OWNER_PROFIT_TO_CAPITAL'] },
      },
    },
    { $group: { _id: '$transactionType', total: { $sum: '$amount' } } },
  ]);
  const ownerCashWithdrawn = round2(ownerTxAgg.find((t) => t._id === 'OWNER_WITHDRAWAL')?.total || 0);
  const ownerToCapital = round2(ownerTxAgg.find((t) => t._id === 'OWNER_PROFIT_TO_CAPITAL')?.total || 0);
  const ownerWithdrawnForThisInvestor = round2(ownerCashWithdrawn + ownerToCapital);

  return {
    totalProfitGenerated: round2(totalProfitGenerated),
    investorProfitShare: round2(investorProfitShare),
    ownerProfitShare: round2(ownerProfitShare),
    investorProfitCashWithdrawn,
    investorProfitToCapital,
    investorProfitWithdrawn: investorWithdrawn,
    ownerProfitWithdrawn: ownerWithdrawnForThisInvestor,
    investorRemainingProfit: round2(investorProfitShare - investorWithdrawn),
    ownerRemainingProfit: round2(ownerProfitShare - ownerWithdrawnForThisInvestor),
  };
}

/** Owner-wide profit summary — sum of the owner's share across every investor, plus all owner profit movements. */
async function getOwnerProfitSummary() {
  const investors = await Investor.find({ isDeleted: { $ne: true } });
  const perInvestor = await Promise.all(
    investors.map(async (inv) => ({ investor: inv, ...(await getInvestorProfitSummary(inv._id)) }))
  );

  const totalOwnerProfit = round2(perInvestor.reduce((acc, row) => acc + row.ownerProfitShare, 0));

  // Aggregate ALL owner profit withdrawals and transfers across all transactions (both investor-specific and general)
  const allOwnerProfitTx = await OwnerTransaction.aggregate([
    {
      $match: {
        transactionType: { $in: ['OWNER_WITHDRAWAL', 'OWNER_PROFIT_TO_CAPITAL'] },
      },
    },
    { $group: { _id: '$transactionType', total: { $sum: '$amount' } } },
  ]);
  const totalOwnerCashWithdrawn = round2(allOwnerProfitTx.find((t) => t._id === 'OWNER_WITHDRAWAL')?.total || 0);
  const totalOwnerProfitToCapital = round2(allOwnerProfitTx.find((t) => t._id === 'OWNER_PROFIT_TO_CAPITAL')?.total || 0);
  const totalOwnerWithdrawn = round2(totalOwnerCashWithdrawn + totalOwnerProfitToCapital);
  const totalOwnerRemaining = round2(Math.max(0, totalOwnerProfit - totalOwnerWithdrawn));

  return {
    totalOwnerProfit,
    totalOwnerCashWithdrawn,
    totalOwnerProfitToCapital,
    totalOwnerWithdrawn,
    totalOwnerRemaining,
    perInvestor: perInvestor.map((row) => ({
      investorId: row.investor._id,
      investorName: row.investor.name,
      ownerProfitShare: row.ownerProfitShare,
      ownerProfitCashWithdrawn: row.ownerProfitCashWithdrawn || 0,
      ownerProfitToCapital: row.ownerProfitToCapital || 0,
      ownerProfitWithdrawn: row.ownerProfitWithdrawn,
      ownerRemainingProfit: row.ownerRemainingProfit,
    })),
  };
}

/**
 * Processes a withdrawal of investor-generated profit. ALWAYS a strict 50/50 split
 * of totalAmount between owner and investor — never an arbitrary split, and never
 * trusting a client-supplied split. Rejects if the investor's remaining realized
 * profit share cannot cover the investor's half of the requested withdrawal.
 */
async function processWithdrawal({ investorId, totalAmount, withdrawalDate, reference, notes }) {
  if (!(totalAmount > 0)) {
    throw Object.assign(new Error('Withdrawal amount must be greater than 0.'), { statusCode: 400 });
  }

  const investor = await Investor.findById(investorId);
  if (!investor || investor.isDeleted) {
    throw Object.assign(new Error('Investor not found.'), { statusCode: 404 });
  }

  const investorAmount = Math.round((totalAmount / 2) * 100) / 100;
  const ownerAmount = Math.round((totalAmount - investorAmount) * 100) / 100; // absorbs any rounding remainder

  // Both sides of the 50/50 split must have sufficient remaining realized profit.
  // In normal operation they should be equal, but partial prior withdrawals or
  // rounding can leave one side short of the other.
  const summary = await getInvestorProfitSummary(investorId);
  if (investorAmount - summary.investorRemainingProfit > 0.009) {
    throw Object.assign(
      new Error(
        `This withdrawal requires PKR ${investorAmount} from ${investor.name}'s profit share, but only PKR ${summary.investorRemainingProfit} remains available.`
      ),
      { statusCode: 400 }
    );
  }
  if (ownerAmount - summary.ownerRemainingProfit > 0.009) {
    throw Object.assign(
      new Error(
        `This withdrawal requires PKR ${ownerAmount} from the Owner's profit share on ${investor.name}'s contracts, but only PKR ${summary.ownerRemainingProfit} remains available.`
      ),
      { statusCode: 400 }
    );
  }

  const withdrawal = await Withdrawal.create({
    investorId,
    totalAmount,
    ownerAmount,
    investorAmount,
    withdrawalDate: withdrawalDate ? new Date(withdrawalDate) : new Date(),
    reference: reference || '',
    notes: notes || '',
  });

  // FIX: this is a PROFIT withdrawal, not a capital return — using RETURN_TO_INVESTOR
  // here previously caused every profit withdrawal to incorrectly shrink the
  // investor's capitalHeld (getInvestorCapitalSummary sums RETURN_TO_INVESTOR as
  // capital returned). PROFIT_WITHDRAWAL is tracked by the Withdrawal model itself
  // and by getInvestorProfitSummary — it must never affect the capital calculation.
  await InvestorTransaction.create({
    investorId,
    transactionType: 'PROFIT_WITHDRAWAL',
    amount: investorAmount,
    transactionDate: withdrawal.withdrawalDate,
    notes: `Profit withdrawal (ref: ${withdrawal._id})`,
  });

  await OwnerTransaction.create({
    transactionType: 'OWNER_WITHDRAWAL',
    amount: ownerAmount,
    transactionDate: withdrawal.withdrawalDate,
    investorId,
    withdrawalId: withdrawal._id,
    notes: `Owner's 50% share of profit withdrawal from ${investor.name}`,
  });

  return withdrawal;
}

/**
 * Owner's CAPITAL summary — completely separate from Owner's PROFIT summary above.
 * Capital is what the Owner has personally put into the business (own money),
 * derived only from CAPITAL_IN / CAPITAL_RETURNED transactions, never from profit.
 *
 *   Capital Held      = sum(CAPITAL_IN) - sum(CAPITAL_RETURNED)
 *   Capital Deployed   = sum of FundingAllocation rows with sourceType OWNER,
 *                        across every currently-funded contract
 *   Capital Available  = Capital Held - Capital Still Deployed + Profit Transferred to Capital
 *
 * FIX: profitTransferredToCapital now comes from OwnerTransaction(OWNER_PROFIT_TO_CAPITAL)
 * records, NOT from Withdrawal.ownerAmount. Old Withdrawal records are cash-outs and must
 * NOT add to available capital (they were already treated as withdrawn profit, not reinvested).
 */
async function getOwnerCapitalSummary() {
  const [txAgg, capitalInTxs] = await Promise.all([
    OwnerTransaction.aggregate([
      {
        $match: {
          transactionType: { $in: ['CAPITAL_IN', 'CAPITAL_RETURNED', 'OWNER_PROFIT_TO_CAPITAL'] },
        },
      },
      { $group: { _id: '$transactionType', total: { $sum: '$amount' } } },
    ]),
    OwnerTransaction.find({
      transactionType: 'CAPITAL_IN',
    }).sort({ createdAt: 1 }),
  ]);

  let originalCapitalInvested = 0;
  let additionalCapitalAdded = 0;
  if (capitalInTxs.length > 0) {
    const initialIndex = capitalInTxs.findIndex((t) => /initial/i.test(t.notes || ''));
    const initialTx = initialIndex >= 0 ? capitalInTxs[initialIndex] : capitalInTxs[0];
    originalCapitalInvested = initialTx.amount || 0;

    const initialId = String(initialTx._id);
    for (const tx of capitalInTxs) {
      if (String(tx._id) !== initialId) {
        additionalCapitalAdded += tx.amount || 0;
      }
    }
  }

  const totalCapitalAdded = round2(originalCapitalInvested + additionalCapitalAdded);
  const totalCapitalReturned = round2(txAgg.find((t) => t._id === 'CAPITAL_RETURNED')?.total || 0);
  const profitTransferredToCapital = round2(txAgg.find((t) => t._id === 'OWNER_PROFIT_TO_CAPITAL')?.total || 0);
  const totalCapitalInjected = round2(totalCapitalAdded + profitTransferredToCapital);

  // Capital Held is total capital in business custody minus capital returned
  const capitalHeld = round2(totalCapitalInjected - totalCapitalReturned);

  const ownerAllocations = await FundingAllocation.find({ sourceType: 'OWNER' });
  const capitalDeployed = round2(ownerAllocations.reduce((sum, a) => sum + a.amount, 0));

  // Compute recovered capital for Owner from all plans where Owner contributed capital
  const planIds = [...new Set(ownerAllocations.map((a) => String(a.planId)))];
  const plans = await InstallmentPlan.find({ _id: { $in: planIds } });

  let recoveredCapitalPaisa = 0;
  for (const plan of plans) {
    if (!plan || !plan.purchaseCost) continue;
    const funding = await getContractFunding(plan);
    const recovery = getContractCapitalRecovery(plan, funding);
    recoveredCapitalPaisa += Math.round(recovery.ownerRecoveredCapital * 100);
  }

  const recoveredCapital = round2(recoveredCapitalPaisa / 100);
  const capitalStillDeployed = round2(Math.max(0, capitalDeployed - recoveredCapital));
  const capitalAvailable = round2(capitalHeld - capitalStillDeployed);

  return {
    originalCapitalInvested: round2(originalCapitalInvested),
    additionalCapitalAdded: round2(additionalCapitalAdded),
    totalCapitalAdded,
    totalCapitalReturned,
    totalCapitalInjected,
    capitalHeld,
    capitalDeployed,
    recoveredCapital,
    capitalStillDeployed,
    profitTransferredToCapital,
    profitReinvested: profitTransferredToCapital,
    capitalAvailable,
  };
}

/**
 * Records an Owner capital movement — adding new capital, or returning capital
 * already held (NOT a profit withdrawal; see OwnerTransaction.OWNER_WITHDRAWAL
 * for that, created only via processWithdrawal). A capital return can never
 * exceed the capital currently held.
 */
async function recordOwnerCapitalTransaction({ transactionType, amount, transactionDate, notes }) {
  if (!['CAPITAL_IN', 'CAPITAL_RETURNED'].includes(transactionType)) {
    throw Object.assign(new Error('Invalid owner capital transaction type.'), { statusCode: 400 });
  }
  if (!(amount > 0)) {
    throw Object.assign(new Error('Amount must be greater than 0.'), { statusCode: 400 });
  }

  if (transactionType === 'CAPITAL_RETURNED') {
    const summary = await getOwnerCapitalSummary();
    if (amount - summary.capitalAvailable > 0.009) {
      throw Object.assign(
        new Error(`Cannot return ${amount} — only ${summary.capitalAvailable} is currently available (undeployed) capital.`),
        { statusCode: 400 }
      );
    }
  }

  const transaction = await OwnerTransaction.create({
    transactionType,
    amount,
    transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
    notes: notes || '',
  });

  return { transaction, capital: await getOwnerCapitalSummary() };
}

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

/**
 * Standalone investor profit cash withdrawal (NOT the 50/50 paired flow).
 * Creates only an InvestorTransaction(PROFIT_WITHDRAWAL). Does NOT create a
 * Withdrawal record and does NOT increase capital.
 */
async function processInvestorProfitCashWithdrawal({ investorId, amount, date, notes }) {
  if (!(amount > 0)) {
    throw Object.assign(new Error('Amount must be greater than 0.'), { statusCode: 400 });
  }
  const investor = await Investor.findById(investorId);
  if (!investor || investor.isDeleted) {
    throw Object.assign(new Error('Investor not found.'), { statusCode: 404 });
  }
  const summary = await getInvestorProfitSummary(investorId);
  if (round2(amount) - summary.investorRemainingProfit > 0.009) {
    throw Object.assign(
      new Error(
        `Cannot withdraw PKR ${amount} — only PKR ${summary.investorRemainingProfit} of profit remains available for ${investor.name}.`
      ),
      { statusCode: 400 }
    );
  }
  await InvestorTransaction.create({
    investorId: investor._id,
    transactionType: 'PROFIT_WITHDRAWAL',
    amount: round2(amount),
    transactionDate: date ? new Date(date) : new Date(),
    notes: notes || '',
  });
  return await getInvestorProfitSummary(investorId);
}

/**
 * Investor transfers profit into their capital pool (internal move, not cash out).
 * Creates only an InvestorTransaction(PROFIT_TO_CAPITAL). Picked up by
 * getInvestorCapitalSummary as profitTransferredToCapital → increases capitalAvailable.
 */
async function processInvestorProfitToCapital({ investorId, amount, date, notes }) {
  if (!(amount > 0)) {
    throw Object.assign(new Error('Amount must be greater than 0.'), { statusCode: 400 });
  }
  const investor = await Investor.findById(investorId);
  if (!investor || investor.isDeleted) {
    throw Object.assign(new Error('Investor not found.'), { statusCode: 404 });
  }
  const summary = await getInvestorProfitSummary(investorId);
  if (round2(amount) - summary.investorRemainingProfit > 0.009) {
    throw Object.assign(
      new Error(
        `Cannot transfer PKR ${amount} to capital — only PKR ${summary.investorRemainingProfit} of profit remains available for ${investor.name}.`
      ),
      { statusCode: 400 }
    );
  }
  await InvestorTransaction.create({
    investorId: investor._id,
    transactionType: 'PROFIT_TO_CAPITAL',
    amount: round2(amount),
    transactionDate: date ? new Date(date) : new Date(),
    notes: notes || '',
  });
  return await getInvestorProfitSummary(investorId);
}

/**
 * Standalone owner profit cash withdrawal (NOT the 50/50 paired flow).
 * Creates an OwnerTransaction(OWNER_WITHDRAWAL). Does NOT increase capital.
 */
async function processOwnerProfitCashWithdrawal({ amount, date, notes }) {
  if (!(amount > 0)) {
    throw Object.assign(new Error('Amount must be greater than 0.'), { statusCode: 400 });
  }
  const profitSummary = await getOwnerProfitSummary();
  if (round2(amount) - profitSummary.totalOwnerRemaining > 0.009) {
    throw Object.assign(
      new Error(
        `Cannot withdraw PKR ${amount} — only PKR ${profitSummary.totalOwnerRemaining} of owner profit remains available.`
      ),
      { statusCode: 400 }
    );
  }
  await OwnerTransaction.create({
    transactionType: 'OWNER_WITHDRAWAL',
    amount: round2(amount),
    transactionDate: date ? new Date(date) : new Date(),
    notes: notes || '',
  });
  return await getOwnerProfitSummary();
}

/**
 * Owner transfers profit into their capital pool (internal move, not cash out).
 * Creates an OwnerTransaction(OWNER_PROFIT_TO_CAPITAL). Picked up by
 * getOwnerCapitalSummary as profitTransferredToCapital → increases capitalAvailable.
 */
async function processOwnerProfitToCapital({ amount, date, notes }) {
  if (!(amount > 0)) {
    throw Object.assign(new Error('Amount must be greater than 0.'), { statusCode: 400 });
  }
  const profitSummary = await getOwnerProfitSummary();
  if (round2(amount) - profitSummary.totalOwnerRemaining > 0.009) {
    throw Object.assign(
      new Error(
        `Cannot transfer PKR ${amount} to capital — only PKR ${profitSummary.totalOwnerRemaining} of owner profit remains available.`
      ),
      { statusCode: 400 }
    );
  }
  await OwnerTransaction.create({
    transactionType: 'OWNER_PROFIT_TO_CAPITAL',
    amount: round2(amount),
    transactionDate: date ? new Date(date) : new Date(),
    notes: notes || '',
  });
  return { profit: await getOwnerProfitSummary(), capital: await getOwnerCapitalSummary() };
}

module.exports = {
  getContractFunding,
  getContractCapitalRecovery,
  calculateProfitDistribution,
  recalculateAllForInvestor,
  getInvestorProfitSummary,
  getOwnerProfitSummary,
  getOwnerCapitalSummary,
  recordOwnerCapitalTransaction,
  processWithdrawal,
  processInvestorProfitCashWithdrawal,
  processInvestorProfitToCapital,
  processOwnerProfitCashWithdrawal,
  processOwnerProfitToCapital,
};
