const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const InstallmentPlan = require('../models/InstallmentPlan');
const MissedInstallmentEvent = require('../models/MissedInstallmentEvent');
const asyncHandler = require('../middleware/asyncHandler');
const { startOfDay } = require('../utils/dateHelpers');
const { parseDateFilter } = require('../utils/dateFilter');

// Backward compatible with plain from/to, and now also supports presets
// (today/yesterday/this_week/last_week/this_month/last_month/custom) via
// parseDateFilter — used by report and export endpoints.
function parseRange(req) {
  const { from, to, preset } = req.query;
  if (preset) return parseDateFilter(req.query);
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

const dailyCollection = asyncHandler(async (req, res) => {
  const range = parseRange(req);
  const match = range ? { paymentDate: range } : {};
  const data = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data });
});

const monthlyCollection = asyncHandler(async (req, res) => {
  const range = parseRange(req);
  const match = range ? { paymentDate: range } : {};
  const data = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data });
});

const profitReport = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.find({}).populate('customerId', 'name contactNumber');
  const data = plans.map((p) => ({
    customer: p.customerId,
    product: p.productName,
    purchaseCost: p.purchaseCost,
    sellingPrice: p.sellingPrice,
    expectedProfit: p.expectedProfit,
    expectedLoss: p.expectedLoss,
    profitMargin: Math.round(p.profitMargin * 100) / 100,
    totalCollected: (p.totalPaid || 0) + (p.downPayment || 0),
    remaining: p.remainingAmount,
    status: p.status,
  }));
  res.json({ success: true, data });
});

const lossReport = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.find({ expectedLoss: { $gt: 0 } }).populate('customerId', 'name contactNumber');
  res.json({ success: true, data: plans });
});

const monthlyProfitReport = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.aggregate([
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
        sales: { $sum: '$sellingPrice' },
        cost: { $sum: '$purchaseCost' },
        collected: { $sum: { $add: ['$totalPaid', { $ifNull: ['$downPayment', 0] }] } },
        outstanding: { $sum: '$remainingAmount' },
        profit: { $sum: '$expectedProfit' },
        loss: { $sum: '$expectedLoss' },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  res.json({ success: true, data: plans });
});

const outstandingReport = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.find({ remainingAmount: { $gt: 0 } })
    .populate('customerId', 'name contactNumber')
    .sort({ remainingAmount: -1 });
  res.json({ success: true, data: plans });
});

const overdueReport = asyncHandler(async (req, res) => {
  const today = startOfDay(new Date());
  const overdue = await Installment.find({ status: 'OVERDUE' })
    .populate('customerId', 'name contactNumber')
    .populate('planId', 'contractId productName')
    .sort({ dueDate: 1 });

  const data = overdue.map((i) => ({
    customer: i.customerId,
    contract: i.planId,
    installmentNumber: i.installmentNumber,
    dueDate: i.dueDate,
    daysOverdue: Math.floor((today - startOfDay(i.dueDate)) / (1000 * 60 * 60 * 24)),
    amountDue: i.amountDue,
    paid: i.paidAmount,
    remaining: i.amountDue - i.paidAmount,
  }));
  res.json({ success: true, data });
});

const missedReport = asyncHandler(async (req, res) => {
  const events = await MissedInstallmentEvent.find({})
    .populate('customerId', 'name contactNumber')
    .populate('installmentId', 'installmentNumber monthLabel dueDate status')
    .sort({ recordedDate: -1 });
  res.json({ success: true, data: events });
});

const customerLedger = asyncHandler(async (req, res) => {
  const { customerId } = req.query;
  if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required.' });

  const [plans, payments, installments] = await Promise.all([
    InstallmentPlan.find({ customerId }),
    Payment.find({ customerId }).sort({ paymentDate: 1 }),
    Installment.find({ customerId }).sort({ dueDate: 1 }),
  ]);

  res.json({ success: true, data: { plans, payments, installments } });
});

module.exports = {
  dailyCollection,
  monthlyCollection,
  profitReport,
  lossReport,
  monthlyProfitReport,
  outstandingReport,
  overdueReport,
  missedReport,
  customerLedger,
};
