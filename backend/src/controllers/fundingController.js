const asyncHandler = require('../middleware/asyncHandler');
const InstallmentPlan = require('../models/InstallmentPlan');
const FundingAllocation = require('../models/FundingAllocation');
const Investor = require('../models/Investor');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');

/**
 * Replaces a contract's funding allocation with a new multi-source split
 * (Owner + one or more Investors). This is additive to — and takes precedence
 * over — the plan's simple single-investor fields once used; it does not
 * require every contract to use it.
 *
 * Every rule here is enforced server-side, never trusted from the client:
 *   - each investor row's amount must not exceed that investor's REAL available
 *     capital (recomputed fresh, excluding this contract's own prior allocation
 *     to avoid double-counting)
 *   - the sum of all rows must exactly equal the contract's required capital
 *     (its purchaseCost)
 */
const allocateFunding = asyncHandler(async (req, res) => {
  const { planId } = req.params;
  const { allocations } = req.body; // [{ sourceType: 'OWNER'|'INVESTOR', investorId, amount }]

  const plan = await InstallmentPlan.findById(planId);
  if (!plan) return res.status(404).json({ success: false, message: 'Contract not found.' });

  if (!Array.isArray(allocations) || allocations.length === 0) {
    return res.status(400).json({ success: false, message: 'At least one funding allocation row is required.' });
  }

  const requiredCapital = plan.purchaseCost;
  const totalAllocated = allocations.reduce((s, a) => s + Number(a.amount || 0), 0);
  if (Math.abs(totalAllocated - requiredCapital) > 0.009) {
    return res.status(400).json({
      success: false,
      message: `Total funding allocation (${totalAllocated}) must equal the contract's required capital (${requiredCapital}).`,
    });
  }

  const existingAllocations = await FundingAllocation.find({ planId: plan._id });
  const priorOwnerAmount = existingAllocations.filter((a) => a.sourceType === 'OWNER').reduce((s, a) => s + a.amount, 0);
  const priorInvestorAmountMap = new Map();
  existingAllocations
    .filter((a) => a.sourceType === 'INVESTOR' && a.investorId)
    .forEach((a) => {
      const id = String(a.investorId);
      priorInvestorAmountMap.set(id, (priorInvestorAmountMap.get(id) || 0) + a.amount);
    });

  let ownerCapital = null;
  if (allocations.some((row) => row.sourceType === 'OWNER')) {
    ownerCapital = await accountingService.getOwnerCapitalSummary();
  }

  for (const row of allocations) {
    if (!(Number(row.amount) > 0)) {
      return res.status(400).json({ success: false, message: 'Every allocation amount must be greater than 0.' });
    }
    if (row.sourceType === 'OWNER') {
      const maxOwnerAvailable = ownerCapital.capitalAvailable + priorOwnerAmount;
      if (Number(row.amount) - maxOwnerAvailable > 0.009) {
        return res.status(400).json({
          success: false,
          message: `Insufficient Owner capital. Available: ${maxOwnerAvailable}, Required: ${row.amount}.`,
        });
      }
    } else if (row.sourceType === 'INVESTOR') {
      if (!row.investorId) {
        return res.status(400).json({ success: false, message: 'investorId is required for an INVESTOR allocation row.' });
      }
      const investor = await Investor.findById(row.investorId);
      if (!investor || investor.isDeleted) {
        return res.status(404).json({ success: false, message: 'One of the selected investors was not found.' });
      }
      if (investor.status !== 'ACTIVE') {
        return res.status(400).json({ success: false, message: `${investor.name} is not active and cannot receive new funding.` });
      }
      const capital = await investorService.getInvestorCapitalSummary(investor._id);
      const priorInvAmount = priorInvestorAmountMap.get(String(investor._id)) || 0;
      const maxInvAvailable = capital.capitalAvailable + priorInvAmount;
      if (Number(row.amount) - maxInvAvailable > 0.009) {
        return res.status(400).json({
          success: false,
          message: `${investor.name}'s allocation (${row.amount}) exceeds their available capital (${maxInvAvailable}).`,
        });
      }
    }
  }

  await FundingAllocation.deleteMany({ planId: plan._id });

  const created = await FundingAllocation.insertMany(
    allocations.map((row) => ({
      planId: plan._id,
      sourceType: row.sourceType,
      investorId: row.sourceType === 'INVESTOR' ? row.investorId : null,
      amount: Number(row.amount),
    }))
  );

  // Keep the plan's simple summary fields consistent for anything that still reads
  // them directly (e.g. dashboards): if any investor funding exists, mark the plan
  // as investor-funded and sum the investor-side allocation into capitalDeployed.
  const investorTotal = created.filter((a) => a.sourceType === 'INVESTOR').reduce((s, a) => s + a.amount, 0);
  if (investorTotal > 0) {
    plan.fundingSource = 'INVESTOR';
    plan.capitalDeployed = investorTotal;
    // When multiple investors are involved, the plan's single investorId field
    // can't represent all of them — it's left pointing at the largest contributor
    // for simple displays, while FundingAllocation remains the source of truth.
    const largest = created
      .filter((a) => a.sourceType === 'INVESTOR')
      .sort((a, b) => b.amount - a.amount)[0];
    plan.investorId = largest ? largest.investorId : null;
  } else {
    plan.fundingSource = 'BUSINESS';
    plan.capitalDeployed = 0;
    plan.investorId = null;
  }
  await plan.save();
  await accountingService.calculateProfitDistribution(plan._id);

  res.status(201).json({ success: true, data: created });
});

const getFunding = asyncHandler(async (req, res) => {
  const allocations = await FundingAllocation.find({ planId: req.params.planId }).populate('investorId', 'name investorId');
  res.json({ success: true, data: allocations });
});

module.exports = { allocateFunding, getFunding };
