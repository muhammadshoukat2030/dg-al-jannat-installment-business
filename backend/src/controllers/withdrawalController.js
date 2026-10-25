const asyncHandler = require('../middleware/asyncHandler');
const Withdrawal = require('../models/Withdrawal');
const accountingService = require('../services/accountingService');
const { parseDateFilter } = require('../utils/dateFilter');

const listWithdrawals = asyncHandler(async (req, res) => {
  const { investorId, page = 1, limit = 30, preset, from, to } = req.query;
  const query = {};
  if (investorId) query.investorId = investorId;

  const dateRange = parseDateFilter({ preset, from, to });
  if (dateRange) query.withdrawalDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(query).populate('investorId', 'name investorId').sort({ withdrawalDate: -1 }).skip(skip).limit(Number(limit)),
    Withdrawal.countDocuments(query),
  ]);
  res.json({ success: true, data: withdrawals, total, page: Number(page), pages: Math.ceil(total / limit) });
});

const getWithdrawal = asyncHandler(async (req, res) => {
  const withdrawal = await Withdrawal.findById(req.params.id).populate('investorId', 'name investorId');
  if (!withdrawal) return res.status(404).json({ success: false, message: 'Withdrawal not found.' });
  res.json({ success: true, data: withdrawal });
});

/**
 * Creates a withdrawal. The client sends only investorId + totalAmount (+ optional
 * date/reference/notes) — the 50/50 owner/investor split and the "does the investor
 * have enough remaining profit" check are ALWAYS computed server-side in
 * accountingService.processWithdrawal, never trusted from the request body.
 */
const createWithdrawal = asyncHandler(async (req, res) => {
  const { investorId, totalAmount, withdrawalDate, reference, notes } = req.body;
  if (!investorId || !totalAmount) {
    return res.status(400).json({ success: false, message: 'investorId and totalAmount are required.' });
  }

  try {
    const withdrawal = await accountingService.processWithdrawal({
      investorId,
      totalAmount: Number(totalAmount),
      withdrawalDate,
      reference,
      notes,
    });
    res.status(201).json({ success: true, data: withdrawal });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

module.exports = { listWithdrawals, getWithdrawal, createWithdrawal };
