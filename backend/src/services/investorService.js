const mongoose = require('mongoose');
const InvestorTransaction = require('../models/InvestorTransaction');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Customer = require('../models/Customer');
const FundingAllocation = require('../models/FundingAllocation');
const Withdrawal = require('../models/Withdrawal');

/**
 * Capital accounting formulas (kept in one place, per the spec):
 *
 *   Total Invested = sum(INVESTMENT_IN)
 *   Total Returned = sum(RETURN_TO_INVESTOR)
 *   Capital Held   = Total Invested - Total Returned
 *   Capital Deployed = sum(capitalDeployed) across this investor's contracts
 *   Recovered Capital = proportional share of collections beyond expected profit
 *   Capital Still Deployed = Capital Deployed - Recovered Capital
 *   Profit Transferred to Capital = sum of manual profit withdrawals (reinvested)
 *   Capital Available = (Capital Held - Capital Still Deployed) + Profit Transferred to Capital
 */
async function getInvestorCapitalSummary(investorId) {
  const investorObjectId =
    typeof investorId === 'string' && mongoose.Types.ObjectId.isValid(investorId)
      ? new mongoose.Types.ObjectId(investorId)
      : investorId;

  const allocatedPlanIds = await FundingAllocation.distinct('planId');

  const [txAgg, planAgg, allocAgg] = await Promise.all([
    InvestorTransaction.aggregate([
      { $match: { investorId: investorObjectId } },
      { $group: { _id: '$transactionType', total: { $sum: '$amount' } } },
    ]),
    InstallmentPlan.aggregate([
      { $match: { investorId: investorObjectId } },
      {
        $group: {
          _id: null,
          directCapitalDeployed: {
            $sum: {
              $cond: [{ $in: ['$_id', allocatedPlanIds] }, 0, '$capitalDeployed'],
            },
          },
          contractCount: { $sum: 1 },
          totalSale: { $sum: '$sellingPrice' },
          totalCost: { $sum: '$purchaseCost' },
          totalCollected: { $sum: { $add: ['$totalPaid', { $ifNull: ['$downPayment', 0] }] } },
          totalOutstanding: { $sum: '$remainingAmount' },
          expectedProfit: { $sum: '$expectedProfit' },
          expectedLoss: { $sum: '$expectedLoss' },
        },
      },
    ]),
    FundingAllocation.aggregate([
      { $match: { sourceType: 'INVESTOR', investorId: investorObjectId } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
  ]);

  const totalInvested = txAgg.find((t) => t._id === 'INVESTMENT_IN')?.total || 0;
  const totalReturned = txAgg.find((t) => t._id === 'RETURN_TO_INVESTOR')?.total || 0;
  const capitalHeld = Math.round((totalInvested - totalReturned) * 100) / 100;

  const planStats = planAgg[0] || {
    directCapitalDeployed: 0,
    contractCount: 0,
    totalSale: 0,
    totalCost: 0,
    totalCollected: 0,
    totalOutstanding: 0,
    expectedProfit: 0,
    expectedLoss: 0,
  };
  const allocDeployed = allocAgg[0]?.total || 0;
  const capitalDeployed = Math.round(((planStats.directCapitalDeployed || 0) + allocDeployed) * 100) / 100;

  // Calculate recovered capital from all contracts funded by this investor
  const [allocRows, legacyPlans] = await Promise.all([
    FundingAllocation.find({ sourceType: 'INVESTOR', investorId: investorObjectId }),
    InstallmentPlan.find({ investorId: investorObjectId, _id: { $nin: allocatedPlanIds } }),
  ]);

  const fundedPlanIds = [...new Set([...allocRows.map((a) => String(a.planId)), ...legacyPlans.map((p) => String(p._id))])];
  const plans = await InstallmentPlan.find({ _id: { $in: fundedPlanIds } });

  const accountingService = require('./accountingService');
  let recoveredCapitalPaisa = 0;

  for (const plan of plans) {
    if (!plan || !plan.purchaseCost) continue;
    const funding = await accountingService.getContractFunding(plan);
    const recovery = accountingService.getContractCapitalRecovery(plan, funding);
    const mine = recovery.investorShares.find((s) => String(s.investorId) === String(investorObjectId));
    if (mine) {
      recoveredCapitalPaisa += Math.round(mine.recoveredCapital * 100);
    }
  }

  const recoveredCapital = Math.round(recoveredCapitalPaisa) / 100;
  const capitalStillDeployed = Math.round(Math.max(0, capitalDeployed - recoveredCapital) * 100) / 100;

  // FIX: profitTransferredToCapital comes from InvestorTransaction(PROFIT_TO_CAPITAL) records,
  // NOT from Withdrawal.investorAmount. Old Withdrawal records are cash-outs and must NOT
  // be counted as capital reinvestment. PROFIT_TO_CAPITAL is an explicit opt-in transfer.
  const profitTransferredToCapital = Math.round((txAgg.find((t) => t._id === 'PROFIT_TO_CAPITAL')?.total || 0) * 100) / 100;

  // Available capital = (Capital Held - Capital Still Deployed) + Profit Transferred to Capital
  const capitalAvailable = Math.round((capitalHeld - capitalStillDeployed + profitTransferredToCapital) * 100) / 100;

  const fundedCustomerIds = await InstallmentPlan.distinct('customerId', {
    $or: [{ investorId: investorObjectId }, { _id: { $in: await FundingAllocation.distinct('planId', { investorId: investorObjectId }) } }],
  });

  return {
    totalInvested: Math.round(totalInvested * 100) / 100,
    totalReturned: Math.round(totalReturned * 100) / 100,
    capitalHeld,
    capitalDeployed,
    recoveredCapital,
    capitalStillDeployed,
    profitTransferredToCapital,
    profitReinvested: profitTransferredToCapital,
    capitalAvailable,
    customersFunded: fundedCustomerIds.length,
    contractsFunded: planStats.contractCount,
    productsFunded: planStats.contractCount,
    customerCollections: Math.round(planStats.totalCollected * 100) / 100,
    outstanding: Math.round(planStats.totalOutstanding * 100) / 100,
    totalSale: Math.round(planStats.totalSale * 100) / 100,
    totalCost: Math.round(planStats.totalCost * 100) / 100,
    expectedProfit: Math.round(planStats.expectedProfit * 100) / 100,
    expectedLoss: Math.round(planStats.expectedLoss * 100) / 100,
  };
}

async function getInvestorInstallmentStats(investorId) {
  const investorObjectId =
    typeof investorId === 'string' && mongoose.Types.ObjectId.isValid(investorId)
      ? new mongoose.Types.ObjectId(investorId)
      : investorId;
  const agg = await Installment.aggregate([
    { $match: { investorId: investorObjectId } },
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const byStatus = { PAID: 0, PARTIAL: 0, PENDING: 0, MISSED: 0, OVERDUE: 0 };
  agg.forEach((row) => {
    byStatus[row._id] = row.count;
  });
  return byStatus;
}

/**
 * "Customers Funded by This Investor" — grouped by CUSTOMER (not one row per contract),
 * so the Owner sees, per customer, how many contracts this investor funded in total.
 */
async function getFundedCustomers(investorId, { page = 1, limit = 20 } = {}) {
  const skip = (Number(page) - 1) * Number(limit);
  const mongoose = require('mongoose');
  const investorObjectId = typeof investorId === 'string' ? new mongoose.Types.ObjectId(investorId) : investorId;

  const grouped = await InstallmentPlan.aggregate([
    { $match: { investorId: investorObjectId } },
    {
      $group: {
        _id: '$customerId',
        contractsFunded: { $sum: 1 },
        totalDeployed: { $sum: '$capitalDeployed' },
        totalCollected: { $sum: '$totalPaid' },
        totalOutstanding: { $sum: '$remainingAmount' },
        statuses: { $push: '$status' },
      },
    },
    { $sort: { totalDeployed: -1 } },
    { $skip: skip },
    { $limit: Number(limit) },
  ]);

  const total = (await InstallmentPlan.distinct('customerId', { investorId: investorObjectId })).length;

  const customerIds = grouped.map((g) => g._id);
  const customers = await Customer.find({ _id: { $in: customerIds } }).select('name contactNumber customerId');
  const customerMap = new Map(customers.map((c) => [String(c._id), c]));

  return {
    data: grouped.map((g) => ({
      customer: customerMap.get(String(g._id)) || null,
      contractsFunded: g.contractsFunded,
      deployed: Math.round(g.totalDeployed * 100) / 100,
      collected: Math.round(g.totalCollected * 100) / 100,
      outstanding: Math.round(g.totalOutstanding * 100) / 100,
      statuses: g.statuses,
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

async function getFundedContracts(investorId, { search, status, page = 1, limit = 20, preset, from, to } = {}) {
  const { parseDateFilter } = require('../utils/dateFilter');
  const query = { investorId };
  if (status) query.status = status;

  const dateRange = parseDateFilter({ preset, from, to });
  if (dateRange) query.startDate = dateRange;

  let customerIds = null;
  if (search) {
    const matchingCustomers = await Customer.find({
      isDeleted: { $ne: true },
      $or: [{ name: { $regex: search, $options: 'i' } }, { customerId: { $regex: search, $options: 'i' } }],
    }).select('_id');
    customerIds = matchingCustomers.map((c) => c._id);
    query.$or = [{ contractId: { $regex: search, $options: 'i' } }, { productName: { $regex: search, $options: 'i' } }, { customerId: { $in: customerIds } }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [plans, total] = await Promise.all([
    InstallmentPlan.find(query).populate('customerId', 'name contactNumber').sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    InstallmentPlan.countDocuments(query),
  ]);

  return { data: plans, total, page: Number(page), pages: Math.ceil(total / limit) };
}

async function getInvestorInstallments(investorId, { page = 1, limit = 30, status, preset, from, to } = {}) {
  const { parseDateFilter } = require('../utils/dateFilter');
  const dateRange = parseDateFilter({ preset, from, to });
  const query = { investorId };
  if (status) query.status = status;
  if (dateRange) query.dueDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [installments, total] = await Promise.all([
    Installment.find(query)
      .populate('customerId', 'name contactNumber')
      .populate('planId', 'contractId productName')
      .sort({ dueDate: 1 })
      .skip(skip)
      .limit(Number(limit)),
    Installment.countDocuments(query),
  ]);

  return { data: installments, total, page: Number(page), pages: Math.ceil(total / limit) };
}

async function getInvestorPayments(investorId, { page = 1, limit = 30, preset, from, to } = {}) {
  const { parseDateFilter } = require('../utils/dateFilter');
  const dateRange = parseDateFilter({ preset, from, to });
  const query = { investorId };
  if (dateRange) query.paymentDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('customerId', 'name contactNumber')
      .populate('installmentId', 'installmentNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(query),
  ]);
  return { data: payments, total, page: Number(page), pages: Math.ceil(total / limit) };
}

async function getInvestorTransactions(investorId, { page = 1, limit = 30, preset, from, to } = {}) {
  const { parseDateFilter } = require('../utils/dateFilter');
  const dateRange = parseDateFilter({ preset, from, to });
  const query = { investorId };
  if (dateRange) query.transactionDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    InvestorTransaction.find(query).sort({ transactionDate: -1 }).skip(skip).limit(Number(limit)),
    InvestorTransaction.countDocuments(query),
  ]);
  return { data: transactions, total, page: Number(page), pages: Math.ceil(total / limit) };
}

/** Overall investor overview for the main dashboard — real MongoDB aggregation, no hard-coded numbers. */
async function getInvestorDashboardOverview() {
  const Investor = require('../models/Investor');
  const accountingService = require('./accountingService');

  const [investorCount, txAgg, allocRows, withdrawals] = await Promise.all([
    Investor.countDocuments({ isDeleted: { $ne: true } }),
    InvestorTransaction.aggregate([{ $group: { _id: '$transactionType', total: { $sum: '$amount' } } }]),
    FundingAllocation.find({ sourceType: 'INVESTOR' }),
    Withdrawal.find(),
  ]);

  const totalInvested = txAgg.find((t) => t._id === 'INVESTMENT_IN')?.total || 0;
  const totalReturned = txAgg.find((t) => t._id === 'RETURN_TO_INVESTOR')?.total || 0;
  const capitalHeld = Math.round((totalInvested - totalReturned) * 100) / 100;

  const allocatedPlanIds = await FundingAllocation.distinct('planId');
  const legacyPlans = await InstallmentPlan.find({
    fundingSource: 'INVESTOR',
    _id: { $nin: allocatedPlanIds },
  });

  let totalDeployedPaisa = allocRows.reduce((sum, a) => sum + Math.round((a.amount || 0) * 100), 0);
  legacyPlans.forEach((p) => {
    totalDeployedPaisa += Math.round((p.capitalDeployed || p.purchaseCost || 0) * 100);
  });
  const totalCapitalDeployed = totalDeployedPaisa / 100;

  const allPlanIds = [...new Set([...allocRows.map((a) => a.planId), ...legacyPlans.map((p) => p._id)])];
  const allPlans = await InstallmentPlan.find({ _id: { $in: allPlanIds } });

  let totalRecoveredCapitalPaisa = 0;
  for (const plan of allPlans) {
    const funding = await accountingService.getContractFunding(plan);
    const recovery = accountingService.getContractCapitalRecovery(plan, funding);
    totalRecoveredCapitalPaisa += Math.round(recovery.investorRecoveredCapital * 100);
  }
  const totalRecoveredCapital = totalRecoveredCapitalPaisa / 100;
  const totalCapitalStillDeployed = Math.round(Math.max(0, totalCapitalDeployed - totalRecoveredCapital) * 100) / 100;

  const profitToCapitalAgg = await InvestorTransaction.aggregate([
    { $match: { transactionType: 'PROFIT_TO_CAPITAL' } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const totalProfitReinvested = Math.round((profitToCapitalAgg[0]?.total || 0) * 100) / 100;
  const capitalAvailable = Math.round((capitalHeld - totalCapitalStillDeployed + totalProfitReinvested) * 100) / 100;

  const fundedCustomerIds = await InstallmentPlan.distinct('customerId', {
    $or: [{ fundingSource: 'INVESTOR' }, { _id: { $in: allocatedPlanIds } }],
  });

  const totalOutstanding = allPlans.reduce((sum, p) => sum + (p.remainingAmount || 0), 0);
  const totalCollected = allPlans.reduce((sum, p) => sum + ((p.totalPaid || 0) + (p.downPayment || 0)), 0);

  return {
    totalInvestors: investorCount,
    totalCapitalReceived: Math.round(totalInvested * 100) / 100,
    totalCapitalReturned: Math.round(totalReturned * 100) / 100,
    totalCapitalHeld: capitalHeld,
    totalCapitalDeployed: Math.round(totalCapitalDeployed * 100) / 100,
    totalRecoveredCapital: Math.round(totalRecoveredCapital * 100) / 100,
    totalCapitalStillDeployed: Math.round(totalCapitalStillDeployed * 100) / 100,
    totalProfitReinvested,
    totalCapitalAvailable: capitalAvailable,
    customersFunded: fundedCustomerIds.length,
    contractsFunded: allPlans.length,
    outstandingFromFundedContracts: Math.round(totalOutstanding * 100) / 100,
    collectionsFromFundedContracts: Math.round(totalCollected * 100) / 100,
  };
}

async function getTopInvestors(limit = 5) {
  const Investor = require('../models/Investor');
  const investors = await Investor.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).limit(limit);
  const summaries = await Promise.all(
    investors.map(async (inv) => {
      const capital = await getInvestorCapitalSummary(inv._id);
      return { investor: inv, ...capital };
    })
  );
  return summaries.sort((a, b) => b.totalInvested - a.totalInvested);
}

module.exports = {
  getInvestorCapitalSummary,
  getInvestorInstallmentStats,
  getFundedCustomers,
  getFundedContracts,
  getInvestorInstallments,
  getInvestorPayments,
  getInvestorTransactions,
  getInvestorDashboardOverview,
  getTopInvestors,
};
