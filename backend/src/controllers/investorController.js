const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const InstallmentPlan = require('../models/InstallmentPlan');
const Withdrawal = require('../models/Withdrawal');
const asyncHandler = require('../middleware/asyncHandler');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');

async function generateInvestorId() {
  const latest = await Investor.findOne({}, { investorId: 1 }).sort({ investorId: -1 });
  let nextNum = 1;
  if (latest && latest.investorId) {
    const match = latest.investorId.match(/\d+/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  return `INV-${String(nextNum).padStart(4, '0')}`;
}

const listInvestors = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;
  const query = { isDeleted: { $ne: true } };

  if (status === 'archived') query.isArchived = true;
  else if (status === 'active') query.isArchived = false;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
      { cnic: { $regex: search, $options: 'i' } },
      { investorId: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [investors, total] = await Promise.all([
    Investor.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Investor.countDocuments(query),
  ]);

  // Attach a lightweight capital summary per row (single-page batch, not the full app,
  // so N summary aggregations here is acceptable — pagination keeps N small).
  const withSummary = await Promise.all(
    investors.map(async (inv) => {
      const summary = await investorService.getInvestorCapitalSummary(inv._id);
      return { ...inv.toObject(), ...summary };
    })
  );

  res.json({ success: true, data: withSummary, total, page: Number(page), pages: Math.ceil(total / limit) });
});

const getInvestor = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const [capital, installmentStats] = await Promise.all([
    investorService.getInvestorCapitalSummary(investor._id),
    investorService.getInvestorInstallmentStats(investor._id),
  ]);

  res.json({ success: true, data: { investor, capital, installmentStats } });
});

const createInvestor = asyncHandler(async (req, res) => {
  const { name, phone } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ success: false, message: 'Name and phone are required.' });
  }
  const investorId = await generateInvestorId();
  const investor = await Investor.create({ ...req.body, investorId });
  res.status(201).json({ success: true, data: investor });
});

const updateInvestor = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const { investorId, isDeleted, _id, createdAt, updatedAt, __v, ...updatable } = req.body;
  Object.assign(investor, updatable);
  await investor.save();
  res.json({ success: true, data: investor });
});

const archiveInvestor = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });
  investor.isArchived = true;
  investor.status = 'INACTIVE';
  await investor.save();
  res.json({ success: true, data: investor });
});

/**
 * Delete an investor. If they have no financial history (no transactions, no
 * funded contracts), permanently remove them. Otherwise, safe-archive: they
 * disappear from active lists but every transaction/contract they funded
 * remains fully intact — nothing is orphaned.
 */
const deleteInvestor = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const [hasTransactions, hasContracts] = await Promise.all([
    InvestorTransaction.exists({ investorId: investor._id }),
    InstallmentPlan.exists({ investorId: investor._id }),
  ]);

  if (!hasTransactions && !hasContracts) {
    await investor.deleteOne();
    return res.json({ success: true, message: `${investor.name} was permanently deleted.`, mode: 'hard' });
  }

  investor.isDeleted = true;
  investor.isArchived = true;
  investor.status = 'INACTIVE';
  await investor.save();
  res.json({
    success: true,
    message: `${investor.name} was archived. Their investment and contract history has been preserved.`,
    mode: 'soft',
  });
});

// ---------- Investor transactions (INVESTMENT_IN / RETURN_TO_INVESTOR / ADJUSTMENT) ----------

const listTransactions = asyncHandler(async (req, res) => {
  const result = await investorService.getInvestorTransactions(req.params.id, req.query);
  res.json({ success: true, ...result });
});

const createTransaction = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const { transactionType, amount, transactionDate, notes } = req.body;
  const numAmount = Number(amount);
  if (!(numAmount > 0) || !Number.isFinite(numAmount)) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0.' });
  }

  // Handle profit transactions if routed here
  if (transactionType === 'PROFIT_CASH_WITHDRAWAL' || transactionType === 'PROFIT_WITHDRAWAL') {
    try {
      await accountingService.processInvestorProfitCashWithdrawal({
        investorId: investor._id,
        amount: numAmount,
        date: transactionDate,
        notes,
      });
      const [profit, capital] = await Promise.all([
        accountingService.getInvestorProfitSummary(investor._id),
        investorService.getInvestorCapitalSummary(investor._id),
      ]);
      return res.status(201).json({ success: true, data: { profit, capital } });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  if (transactionType === 'PROFIT_TO_CAPITAL') {
    try {
      await accountingService.processInvestorProfitToCapital({
        investorId: investor._id,
        amount: numAmount,
        date: transactionDate,
        notes,
      });
      const [profit, capital] = await Promise.all([
        accountingService.getInvestorProfitSummary(investor._id),
        investorService.getInvestorCapitalSummary(investor._id),
      ]);
      return res.status(201).json({ success: true, data: { profit, capital } });
    } catch (err) {
      return res.status(err.statusCode || 400).json({ success: false, message: err.message });
    }
  }

  if (!['INVESTMENT_IN', 'RETURN_TO_INVESTOR', 'ADJUSTMENT'].includes(transactionType)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction type.' });
  }

  // STRICT VALIDATION: Capital return cannot exceed available (undeployed) capital
  if (transactionType === 'RETURN_TO_INVESTOR') {
    const capital = await investorService.getInvestorCapitalSummary(investor._id);
    if (numAmount - capital.capitalAvailable > 0.009) {
      return res.status(400).json({
        success: false,
        message: `Cannot return PKR ${numAmount} — only PKR ${capital.capitalAvailable} is currently available (undeployed) capital.`,
      });
    }
  }

  const transaction = await InvestorTransaction.create({
    investorId: investor._id,
    transactionType,
    amount: numAmount,
    transactionDate: transactionDate ? new Date(transactionDate) : new Date(),
    notes: notes || '',
    operationId: req.body.operationId || undefined,
  });

  const capital = await investorService.getInvestorCapitalSummary(investor._id);
  res.status(201).json({ success: true, data: { transaction, capital } });
});

const investorProfitTransaction = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const { transactionType, amount, transactionDate, notes, operationId } = req.body;
  const numAmount = Number(amount);
  if (!(numAmount > 0) || !Number.isFinite(numAmount)) {
    return res.status(400).json({ success: false, message: 'Amount must be greater than 0.' });
  }

  try {
    if (transactionType === 'PROFIT_CASH_WITHDRAWAL' || transactionType === 'PROFIT_WITHDRAWAL') {
      await accountingService.processInvestorProfitCashWithdrawal({
        investorId: investor._id,
        amount: numAmount,
        date: transactionDate,
        notes,
        operationId,
      });
    } else if (transactionType === 'PROFIT_TO_CAPITAL') {
      await accountingService.processInvestorProfitToCapital({
        investorId: investor._id,
        amount: numAmount,
        date: transactionDate,
        notes,
        operationId,
      });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid profit transaction type.' });
    }

    const [profit, capital] = await Promise.all([
      accountingService.getInvestorProfitSummary(investor._id),
      investorService.getInvestorCapitalSummary(investor._id),
    ]);
    res.status(201).json({ success: true, data: { profit, capital } });
  } catch (err) {
    res.status(err.statusCode || 400).json({ success: false, message: err.message });
  }
});

// ---------- Investor-scoped views ----------

const fundedCustomers = asyncHandler(async (req, res) => {
  const result = await investorService.getFundedCustomers(req.params.id, req.query);
  res.json({ success: true, ...result });
});

const fundedContracts = asyncHandler(async (req, res) => {
  const result = await investorService.getFundedContracts(req.params.id, req.query);
  res.json({ success: true, ...result });
});

const investorInstallments = asyncHandler(async (req, res) => {
  const result = await investorService.getInvestorInstallments(req.params.id, req.query);
  res.json({ success: true, ...result });
});

const investorPayments = asyncHandler(async (req, res) => {
  const result = await investorService.getInvestorPayments(req.params.id, req.query);
  res.json({ success: true, ...result });
});

// ---------- Dashboard-level investor overview ----------

const dashboardOverview = asyncHandler(async (req, res) => {
  const overview = await investorService.getInvestorDashboardOverview();
  const topInvestors = await investorService.getTopInvestors(5);
  res.json({ success: true, data: { overview, topInvestors } });
});

// ---------- Profit sharing & withdrawals (additive accounting extension) ----------

const investorProfit = asyncHandler(async (req, res) => {
  const investor = await Investor.findById(req.params.id);
  if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const profit = await accountingService.getInvestorProfitSummary(investor._id);
  res.json({ success: true, data: profit });
});

const investorWithdrawals = asyncHandler(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const [withdrawals, total] = await Promise.all([
    Withdrawal.find({ investorId: req.params.id }).sort({ withdrawalDate: -1 }).skip(skip).limit(Number(limit)),
    Withdrawal.countDocuments({ investorId: req.params.id }),
  ]);
  res.json({ success: true, data: withdrawals, total, page: Number(page), pages: Math.ceil(total / limit) });
});

module.exports = {
  listInvestors,
  getInvestor,
  createInvestor,
  updateInvestor,
  archiveInvestor,
  deleteInvestor,
  listTransactions,
  createTransaction,
  fundedCustomers,
  fundedContracts,
  investorInstallments,
  investorPayments,
  dashboardOverview,
  investorProfit,
  investorProfitTransaction,
  investorWithdrawals,
};
