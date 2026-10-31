const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const { startOfDay } = require('../utils/dateHelpers');

async function getBusinessOverview() {
  const [totalCustomers, activeContracts, completedContracts] = await Promise.all([
    Customer.countDocuments({ isArchived: false }),
    InstallmentPlan.countDocuments({ status: 'ACTIVE' }),
    InstallmentPlan.countDocuments({ status: 'COMPLETED' }),
  ]);

  // "Active customer" = has at least one ACTIVE plan. "Completed customer" = all plans completed, none active.
  const activeCustomerIds = await InstallmentPlan.distinct('customerId', { status: 'ACTIVE' });
  const completedOnlyCustomerIds = await InstallmentPlan.distinct('customerId', {
    customerId: { $nin: activeCustomerIds },
    status: 'COMPLETED',
  });

  return {
    totalCustomers,
    activeCustomers: activeCustomerIds.length,
    completedCustomers: completedOnlyCustomerIds.length,
    activeContracts,
    completedContracts,
  };
}

async function getFinancialOverview() {
  const agg = await InstallmentPlan.aggregate([
    {
      $group: {
        _id: null,
        totalSales: { $sum: '$sellingPrice' },
        totalProductCost: { $sum: '$purchaseCost' },
        totalCollected: { $sum: { $add: ['$totalPaid', { $ifNull: ['$downPayment', 0] }] } },
        totalRemaining: { $sum: '$remainingAmount' },
        expectedProfit: { $sum: '$expectedProfit' },
        expectedLoss: { $sum: '$expectedLoss' },
      },
    },
  ]);

  const result = agg[0] || {
    totalSales: 0,
    totalProductCost: 0,
    totalCollected: 0,
    totalRemaining: 0,
    expectedProfit: 0,
    expectedLoss: 0,
  };

  return {
    ...result,
    netExpectedProfit: Math.round((result.expectedProfit - result.expectedLoss) * 100) / 100,
  };
}

async function getCollectionOverview() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);

  async function sumSince(date) {
    const agg = await Payment.aggregate([
      { $match: { paymentDate: { $gte: date } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    return agg[0]?.total || 0;
  }

  const [today, week, month, year] = await Promise.all([
    sumSince(todayStart),
    sumSince(weekStart),
    sumSince(monthStart),
    sumSince(yearStart),
  ]);

  return { today, thisWeek: week, thisMonth: month, thisYear: year };
}

async function getInstallmentOverview() {
  const agg = await Installment.aggregate([
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        amountDue: { $sum: '$amountDue' },
        paidAmount: { $sum: '$paidAmount' },
      },
    },
  ]);

  const byStatus = { PAID: 0, PARTIAL: 0, PENDING: 0, MISSED: 0, OVERDUE: 0 };
  let missedAmount = 0;
  let overdueAmount = 0;

  agg.forEach((row) => {
    byStatus[row._id] = row.count;
    if (row._id === 'MISSED') missedAmount = row.amountDue - row.paidAmount;
    if (row._id === 'OVERDUE') overdueAmount = row.amountDue - row.paidAmount;
  });

  return {
    paid: byStatus.PAID,
    partial: byStatus.PARTIAL,
    pending: byStatus.PENDING,
    missed: byStatus.MISSED,
    overdue: byStatus.OVERDUE,
    missedAmount: Math.round(missedAmount * 100) / 100,
    overdueAmount: Math.round(overdueAmount * 100) / 100,
  };
}

async function getTopOutstandingCustomers(limit = 10) {
  const plans = await InstallmentPlan.find({ remainingAmount: { $gt: 0 } })
    .sort({ remainingAmount: -1 })
    .limit(limit * 3) // fetch extra since deleted-customer rows get filtered out below
    .populate({ path: 'customerId', select: 'name contactNumber', match: { isDeleted: { $ne: true } } });

  return plans
    .filter((p) => p.customerId) // populate match sets this to null when the customer was deleted
    .slice(0, limit)
    .map((p) => ({
      customer: p.customerId,
      planId: p._id,
      contractId: p.contractId,
      sellingPrice: p.sellingPrice,
      paid: p.totalPaid,
      remaining: p.remainingAmount,
    }));
}

async function getOverdueCustomers(limit = 20) {
  const today = startOfDay(new Date());
  const overdue = await Installment.find({ status: 'OVERDUE' })
    .sort({ dueDate: 1 })
    .limit(limit * 3) // fetch extra since deleted-customer rows get filtered out below
    .populate({ path: 'customerId', select: 'name contactNumber', match: { isDeleted: { $ne: true } } })
    .populate('planId', 'contractId productName');

  return overdue
    .filter((i) => i.customerId) // populate match sets this to null when the customer was deleted
    .slice(0, limit)
    .map((i) => ({
      customer: i.customerId,
      contract: i.planId,
      installmentNumber: i.installmentNumber,
      dueDate: i.dueDate,
      amountDue: i.amountDue,
      paid: i.paidAmount,
      remaining: i.amountDue - i.paidAmount,
      daysOverdue: Math.floor((today - startOfDay(i.dueDate)) / (1000 * 60 * 60 * 24)),
    }));
}

async function getRecentPayments(limit = 10) {
  const payments = await Payment.find({})
    .sort({ paymentDate: -1 })
    .limit(limit)
    .populate('customerId', 'name contactNumber')
    .populate('installmentId', 'installmentNumber');

  return payments;
}

async function getRecentCustomers(limit = 10) {
  return Customer.find({ isArchived: false }).sort({ createdAt: -1 }).limit(limit);
}

async function getProfitLossSummary() {
  const plans = await InstallmentPlan.find({});
  let profitable = 0;
  let loss = 0;
  let breakEven = 0;
  let totalProfit = 0;
  let totalLoss = 0;

  plans.forEach((p) => {
    if (p.expectedProfit > 0) {
      profitable += 1;
      totalProfit += p.expectedProfit;
    } else if (p.expectedLoss > 0) {
      loss += 1;
      totalLoss += p.expectedLoss;
    } else {
      breakEven += 1;
    }
  });

  return {
    profitableContracts: profitable,
    lossContracts: loss,
    breakEvenContracts: breakEven,
    totalProfit: Math.round(totalProfit * 100) / 100,
    totalLoss: Math.round(totalLoss * 100) / 100,
    netProfit: Math.round((totalProfit - totalLoss) * 100) / 100,
  };
}

async function getDashboardSummary() {
  const investorService = require('./investorService');
  const [
    business,
    financial,
    collection,
    installments,
    profitLoss,
    investorOverview,
    topInvestors,
    topOutstanding,
    overdueCustomers,
    recentPayments,
    recentCustomers,
  ] = await Promise.all([
    getBusinessOverview(),
    getFinancialOverview(),
    getCollectionOverview(),
    getInstallmentOverview(),
    getProfitLossSummary(),
    investorService.getInvestorDashboardOverview(),
    investorService.getTopInvestors(5),
    getTopOutstandingCustomers(10),
    getOverdueCustomers(20),
    getRecentPayments(10),
    getRecentCustomers(10),
  ]);

  // investorOverview/topInvestors are kept as a SEPARATE section — investor capital
  // is never folded into `financial` (sales/profit), per the accounting requirement
  // that business money and investor money must not be mixed.
  return {
    business,
    financial,
    collection,
    installments,
    profitLoss,
    investorOverview,
    topInvestors,
    topOutstanding,
    overdueCustomers,
    recentPayments,
    recentCustomers,
  };
}

module.exports = {
  getBusinessOverview,
  getFinancialOverview,
  getCollectionOverview,
  getInstallmentOverview,
  getTopOutstandingCustomers,
  getOverdueCustomers,
  getRecentPayments,
  getRecentCustomers,
  getProfitLossSummary,
  getDashboardSummary,
};
