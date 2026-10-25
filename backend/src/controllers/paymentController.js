const Payment = require('../models/Payment');
const asyncHandler = require('../middleware/asyncHandler');
const { parseDateFilter } = require('../utils/dateFilter');

const listPayments = asyncHandler(async (req, res) => {
  const { customerId, planId, page = 1, limit = 20, preset, from, to } = req.query;
  const query = {};
  if (customerId) query.customerId = customerId;
  if (planId) query.planId = planId;

  const dateRange = parseDateFilter({ preset, from, to });
  if (dateRange) query.paymentDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(query)
      .populate('customerId', 'name contactNumber email')
      .populate('installmentId', 'installmentNumber')
      .sort({ paymentDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(query),
  ]);

  res.json({ success: true, data: payments, total, page: Number(page), pages: Math.ceil(total / limit) });
});

const getPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('customerId')
    .populate('planId')
    .populate('installmentId');
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });
  res.json({ success: true, data: payment });
});

module.exports = { listPayments, getPayment };
