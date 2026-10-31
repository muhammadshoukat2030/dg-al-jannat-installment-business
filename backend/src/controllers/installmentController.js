const Installment = require('../models/Installment');
const asyncHandler = require('../middleware/asyncHandler');
const { recordPayment, recordMissed } = require('../services/installmentService');
const { parseDateFilter } = require('../utils/dateFilter');

const listInstallments = asyncHandler(async (req, res) => {
  const { planId, customerId, status, preset, from, to } = req.query;
  const query = {};
  if (planId) query.planId = planId;
  if (customerId) query.customerId = customerId;
  if (status) query.status = status;

  const dateRange = parseDateFilter({ preset, from, to });
  if (dateRange) query.dueDate = dateRange;

  const installments = await Installment.find(query).sort({ dueDate: 1 });
  res.json({ success: true, data: installments });
});

const getInstallment = asyncHandler(async (req, res) => {
  const installment = await Installment.findById(req.params.id)
    .populate('customerId', 'name contactNumber')
    .populate('planId', 'contractId productName');
  if (!installment) return res.status(404).json({ success: false, message: 'Installment not found.' });
  res.json({ success: true, data: installment });
});

const payInstallment = asyncHandler(async (req, res) => {
  const { amount, paymentMethod, paymentDate, notes } = req.body;
  const operationId = req.body.operationId || req.headers['x-operation-id'] || req.headers['idempotency-key'] || null;
  if (amount === 0) {
    return res.status(400).json({
      success: false,
      message: 'Amount is 0. Use POST /api/installments/:id/missed to record a missed installment instead.',
    });
  }
  const result = await recordPayment({
    installmentId: req.params.id,
    amount,
    paymentMethod,
    paymentDate,
    notes,
    operationId,
  });
  res.json({ success: true, data: result });
});

const markMissed = asyncHandler(async (req, res) => {
  const { reason, recordedDate, confirm } = req.body;
  if (!confirm) {
    return res.status(400).json({
      success: false,
      message: 'No payment has been received for this installment. Resend with confirm: true to mark this installment as MISSED.',
    });
  }
  const result = await recordMissed({ installmentId: req.params.id, reason, recordedDate });
  res.json({ success: true, data: result });
});

module.exports = { listInstallments, getInstallment, payInstallment, markMissed };
