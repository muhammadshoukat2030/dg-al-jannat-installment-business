const asyncHandler = require('../middleware/asyncHandler');
const dashboardService = require('../services/dashboardService');
const { refreshOverdueStatuses } = require('../services/installmentService');

const summary = asyncHandler(async (req, res) => {
  await refreshOverdueStatuses();
  const data = await dashboardService.getDashboardSummary();
  const [topOutstanding, overdueCustomers, recentPayments, recentCustomers] = await Promise.all([
    dashboardService.getTopOutstandingCustomers(10),
    dashboardService.getOverdueCustomers(20),
    dashboardService.getRecentPayments(10),
    dashboardService.getRecentCustomers(10),
  ]);
  res.json({ success: true, data: { ...data, topOutstanding, overdueCustomers, recentPayments, recentCustomers } });
});

const collections = asyncHandler(async (req, res) => {
  const data = await dashboardService.getCollectionOverview();
  res.json({ success: true, data });
});

const profitLoss = asyncHandler(async (req, res) => {
  const data = await dashboardService.getProfitLossSummary();
  res.json({ success: true, data });
});

const overdue = asyncHandler(async (req, res) => {
  await refreshOverdueStatuses();
  const data = await dashboardService.getOverdueCustomers(100);
  res.json({ success: true, data });
});

const outstanding = asyncHandler(async (req, res) => {
  const data = await dashboardService.getTopOutstandingCustomers(100);
  res.json({ success: true, data });
});

module.exports = { summary, collections, profitLoss, overdue, outstanding };
