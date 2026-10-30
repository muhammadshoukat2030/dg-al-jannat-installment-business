const asyncHandler = require('../middleware/asyncHandler');
const OwnerTransaction = require('../models/OwnerTransaction');
const accountingService = require('../services/accountingService');
const { parseDateFilter } = require('../utils/dateFilter');

const getSummary = asyncHandler(async (req, res) => {
  const profit = await accountingService.getOwnerProfitSummary();
  res.json({ success: true, data: profit });
});

const getTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30, preset, from, to } = req.query;
  const dateRange = parseDateFilter({ preset, from, to });
  const query = {};
  if (dateRange) query.transactionDate = dateRange;

  const skip = (Number(page) - 1) * Number(limit);
  const [transactions, total] = await Promise.all([
    OwnerTransaction.find(query)
      .populate('investorId', 'name investorId')
      .sort({ transactionDate: -1 })
      .skip(skip)
      .limit(Number(limit)),
    OwnerTransaction.countDocuments(query),
  ]);

  res.json({ success: true, data: transactions, total, page: Number(page), pages: Math.ceil(total / limit) });
});

const getProfit = asyncHandler(async (req, res) => {
  const profit = await accountingService.getOwnerProfitSummary();
  res.json({ success: true, data: profit });
});

const getCapital = asyncHandler(async (req, res) => {
  const capital = await accountingService.getOwnerCapitalSummary();
  res.json({ success: true, data: capital });
});

/**
 * Add or return Owner capital. This is completely separate from a profit
 * withdrawal — it moves the Owner's own invested capital, not realized profit.
 * Validation (e.g. can't return more than is currently held) happens inside
 * accountingService.recordOwnerCapitalTransaction, never trusted from the client.
 */
const addCapitalTransaction = asyncHandler(async (req, res) => {
  const { transactionType, amount, transactionDate, notes } = req.body;
  try {
    const result = await accountingService.recordOwnerCapitalTransaction({
      transactionType,
      amount: Number(amount),
      transactionDate,
      notes,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

const ownerProfitTransaction = asyncHandler(async (req, res) => {
  const { transactionType, amount, transactionDate, notes } = req.body;
  const numAmount = Number(amount);
  if (!(numAmount > 0) || !Number.isFinite(numAmount)) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0.' });
  }

  try {
    if (transactionType === 'PROFIT_CASH_WITHDRAWAL' || transactionType === 'PROFIT_WITHDRAWAL') {
      await accountingService.processOwnerProfitCashWithdrawal({
        amount: numAmount,
        date: transactionDate,
        notes,
      });
    } else if (transactionType === 'PROFIT_TO_CAPITAL') {
      await accountingService.processOwnerProfitToCapital({
        amount: numAmount,
        date: transactionDate,
        notes,
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid profit transaction type.' });
    }

    const [profit, capital] = await Promise.all([
      accountingService.getOwnerProfitSummary(),
      accountingService.getOwnerCapitalSummary(),
    ]);
    res.status(201).json({ success: true, data: { profit, capital } });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

const getWithdrawals = asyncHandler(async (req, res) => {
  const Withdrawal = require('../models/Withdrawal');
  const { page = 1, limit = 30, preset, from, to } = req.query;
  const dateRange = parseDateFilter({ preset, from, to });
  const query = dateRange ? { withdrawalDate: dateRange } : {};
  const skip = (Number(page) - 1) * Number(limit);
  const [withdrawals, total] = await Promise.all([
    Withdrawal.find(query).populate('investorId', 'name investorId').sort({ withdrawalDate: -1 }).skip(skip).limit(Number(limit)),
    Withdrawal.countDocuments(query),
  ]);
  res.json({ success: true, data: withdrawals, total, page: Number(page), pages: Math.ceil(total / limit) });
});

module.exports = { getSummary, getTransactions, getProfit, getCapital, addCapitalTransaction, ownerProfitTransaction, getWithdrawals };
