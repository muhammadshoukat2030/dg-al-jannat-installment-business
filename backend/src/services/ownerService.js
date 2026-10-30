const mongoose = require('mongoose');
const InstallmentPlan = require('../models/InstallmentPlan');
const Customer = require('../models/Customer');
const FundingAllocation = require('../models/FundingAllocation');
const ProfitDistribution = require('../models/ProfitDistribution');

function round2(n) {
  return Math.round((n || 0) * 100) / 100;
}

async function getOwnerFundedPlanIds() {
  // Plans explicitly allocated with OWNER FundingAllocation
  const allocPlanIds = await FundingAllocation.distinct('planId', { sourceType: 'OWNER' });
  // Standard BUSINESS-funded plans (no investor)
  const businessPlans = await InstallmentPlan.find({ fundingSource: 'BUSINESS' }).select('_id').lean();
  const businessPlanIds = businessPlans.map((p) => String(p._id));
  // Union
  const allIds = [...new Set([...allocPlanIds.map(String), ...businessPlanIds])];
  return allIds;
}

async function getOwnerFundedSummary() {
  const planIds = await getOwnerFundedPlanIds();
  if (planIds.length === 0) {
    return {
      customersFunded: 0,
      contractsFunded: 0,
      totalCapitalDeployed: 0,
      totalCollections: 0,
      totalOutstanding: 0,
      totalExpectedProfit: 0,
    };
  }

  const objectIds = planIds.map((id) => new mongoose.Types.ObjectId(id));
  const plans = await InstallmentPlan.find({ _id: { $in: objectIds } }).lean();

  const customerIds = [...new Set(plans.map((p) => String(p.customerId)))];
  const contractsFunded = plans.length;

  let totalCapitalDeployed = 0;
  let totalCollections = 0;
  let totalOutstanding = 0;
  let totalExpectedProfit = 0;

  // Get OWNER FundingAllocation amounts
  const allocRows = await FundingAllocation.find({ sourceType: 'OWNER', planId: { $in: objectIds } }).lean();
  const allocMap = new Map();
  for (const alloc of allocRows) {
    const pid = String(alloc.planId);
    allocMap.set(pid, (allocMap.get(pid) || 0) + alloc.amount);
  }

  for (const plan of plans) {
    const pid = String(plan._id);
    // Capital deployed: if explicit OWNER allocation exists, use that amount; else purchaseCost
    const deployed = allocMap.has(pid) ? allocMap.get(pid) : (plan.purchaseCost || 0);
    totalCapitalDeployed += deployed;
    totalCollections += (plan.downPayment || 0) + (plan.totalPaid || 0);
    totalOutstanding += plan.remainingAmount || 0;
    totalExpectedProfit += plan.expectedProfit || 0;
  }

  return {
    customersFunded: customerIds.length,
    contractsFunded,
    totalCapitalDeployed: round2(totalCapitalDeployed),
    totalCollections: round2(totalCollections),
    totalOutstanding: round2(totalOutstanding),
    totalExpectedProfit: round2(totalExpectedProfit),
  };
}

async function getOwnerFundedCustomers({ search, page = 1, limit = 20 } = {}) {
  const planIds = await getOwnerFundedPlanIds();
  const objectIds = planIds.map((id) => new mongoose.Types.ObjectId(id));

  let customerFilter = {};
  if (search) {
    const matchingCustomers = await Customer.find({
      isDeleted: { $ne: true },
      $or: [
        { name: { $regex: search, $options: 'i' } },
        { customerId: { $regex: search, $options: 'i' } },
        { contactNumber: { $regex: search, $options: 'i' } },
      ],
    }).select('_id').lean();
    customerFilter = { customerId: { $in: matchingCustomers.map((c) => c._id) } };
  }

  const planQuery = { _id: { $in: objectIds }, ...customerFilter };
  const skip = (Number(page) - 1) * Number(limit);

  const grouped = await InstallmentPlan.aggregate([
    { $match: planQuery },
    {
      $group: {
        _id: '$customerId',
        contractsFunded: { $sum: 1 },
        totalDeployed: { $sum: '$purchaseCost' },
        totalCollected: { $sum: { $add: ['$totalPaid', { $ifNull: ['$downPayment', 0] }] } },
        totalOutstanding: { $sum: '$remainingAmount' },
        statuses: { $push: '$status' },
      },
    },
    { $sort: { totalDeployed: -1 } },
    { $skip: skip },
    { $limit: Number(limit) },
  ]);

  const total = (await InstallmentPlan.distinct('customerId', planQuery)).length;
  const customerIds = grouped.map((g) => g._id);
  const customers = await Customer.find({ _id: { $in: customerIds } }).select('name contactNumber customerId').lean();
  const customerMap = new Map(customers.map((c) => [String(c._id), c]));

  return {
    data: grouped.map((g) => ({
      customer: customerMap.get(String(g._id)) || null,
      contractsFunded: g.contractsFunded,
      deployed: round2(g.totalDeployed),
      collected: round2(g.totalCollected),
      outstanding: round2(g.totalOutstanding),
      statuses: g.statuses,
    })),
    total,
    page: Number(page),
    pages: Math.ceil(total / limit),
  };
}

async function getOwnerFundedContracts({ search, status, page = 1, limit = 20, preset, from, to } = {}) {
  const { parseDateFilter } = require('../utils/dateFilter');
  const planIds = await getOwnerFundedPlanIds();
  const objectIds = planIds.map((id) => new mongoose.Types.ObjectId(id));

  const query = { _id: { $in: objectIds } };
  if (status) query.status = status;

  const dateRange = parseDateFilter({ preset, from, to });
  if (dateRange) query.startDate = dateRange;

  if (search) {
    const matchingCustomers = await Customer.find({
      isDeleted: { $ne: true },
      $or: [{ name: { $regex: search, $options: 'i' } }, { customerId: { $regex: search, $options: 'i' } }],
    }).select('_id').lean();
    query.$or = [
      { contractId: { $regex: search, $options: 'i' } },
      { productName: { $regex: search, $options: 'i' } },
      { customerId: { $in: matchingCustomers.map((c) => c._id) } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [plans, total] = await Promise.all([
    InstallmentPlan.find(query)
      .populate('customerId', 'name contactNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    InstallmentPlan.countDocuments(query),
  ]);

  return { data: plans, total, page: Number(page), pages: Math.ceil(total / limit) };
}

module.exports = {
  getOwnerFundedPlanIds,
  getOwnerFundedSummary,
  getOwnerFundedCustomers,
  getOwnerFundedContracts,
};
