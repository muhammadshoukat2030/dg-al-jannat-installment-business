const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const OwnerTransaction = require('../models/OwnerTransaction');
const Withdrawal = require('../models/Withdrawal');
const BusinessSetting = require('../models/BusinessSetting');
const FundingAllocation = require('../models/FundingAllocation');
const asyncHandler = require('../middleware/asyncHandler');
const { recordPayment } = require('../services/installmentService');
const { generateCustomerId, generateInvestorId } = require('../utils/idGenerator');
const { getDashboardSummary } = require('../services/dashboardService');
const accountingService = require('../services/accountingService');
const investorService = require('../services/investorService');
const ownerService = require('../services/ownerService');

async function computeInvestorSummaries(investors) {
  const summaries = {};
  if (!Array.isArray(investors)) return summaries;
  for (const inv of investors) {
    try {
      const [capital, installmentStats, profit] = await Promise.all([
        investorService.getInvestorCapitalSummary(inv._id).catch(() => null),
        investorService.getInvestorInstallmentStats(inv._id).catch(() => null),
        accountingService.getInvestorProfitSummary(inv._id).catch(() => null),
      ]);
      summaries[String(inv._id)] = {
        investor: inv,
        capital,
        installmentStats,
        profit,
      };
    } catch (e) {
      // ignore
    }
  }
  return summaries;
}

async function computeCommonReports(plans, installments, payments) {
  try {
    const list = Array.isArray(plans) ? plans : [];
    const instList = Array.isArray(installments) ? installments : [];
    const payList = Array.isArray(payments) ? payments : [];

    const profitData = list.map((p) => ({
      customer: p.customerId,
      product: p.productName,
      purchaseCost: p.purchaseCost,
      sellingPrice: p.sellingPrice,
      expectedProfit: p.expectedProfit,
      expectedLoss: p.expectedLoss,
      profitMargin: Math.round((p.profitMargin || 0) * 100) / 100,
      totalCollected: (p.totalPaid || 0) + (p.downPayment || 0),
      remaining: p.remainingAmount,
      status: p.status,
    }));
    const lossData = list.filter((p) => (p.expectedLoss || 0) > 0);
    const outstandingData = [...list]
      .filter((p) => (p.remainingAmount || 0) > 0)
      .sort((a, b) => (b.remainingAmount || 0) - (a.remainingAmount || 0));

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const overdueData = instList
      .filter((i) => i.status === 'OVERDUE' || (new Date(i.dueDate) < today && (i.remainingAmount > 0 || (i.amountDue - (i.paidAmount || 0)) > 0)))
      .map((i) => {
        const d = new Date(i.dueDate);
        d.setHours(0, 0, 0, 0);
        return {
          customer: i.customerId,
          contract: i.planId,
          installmentNumber: i.installmentNumber,
          dueDate: i.dueDate,
          daysOverdue: Math.max(0, Math.floor((today - d) / (1000 * 60 * 60 * 24))),
          amountDue: i.amountDue,
          paid: i.paidAmount || 0,
          remaining: i.remainingAmount !== undefined ? i.remainingAmount : (i.amountDue - (i.paidAmount || 0)),
        };
      });

    const missedData = instList
      .filter((i) => i.status === 'MISSED')
      .map((i) => ({
        customerId: i.customerId,
        installmentId: i,
        recordedDate: i.updatedAt || i.dueDate,
      }));

    const dailyMap = new Map();
    payList.forEach((p) => {
      if (!p.paymentDate) return;
      const key = new Date(p.paymentDate).toISOString().slice(0, 10);
      if (!dailyMap.has(key)) {
        dailyMap.set(key, { _id: key, total: 0, count: 0 });
      }
      const entry = dailyMap.get(key);
      entry.total += Number(p.amount || 0);
      entry.count += 1;
    });
    const dailyData = Array.from(dailyMap.values()).sort((a, b) => b._id.localeCompare(a._id));

    const monthlyMap = new Map();
    payList.forEach((p) => {
      if (!p.paymentDate) return;
      const key = new Date(p.paymentDate).toISOString().slice(0, 7);
      if (!monthlyMap.has(key)) {
        monthlyMap.set(key, { _id: key, total: 0, count: 0 });
      }
      const entry = monthlyMap.get(key);
      entry.total += Number(p.amount || 0);
      entry.count += 1;
    });
    const monthlyData = Array.from(monthlyMap.values()).sort((a, b) => b._id.localeCompare(a._id));

    return {
      profit: profitData,
      loss: lossData,
      outstanding: outstandingData,
      overdue: overdueData,
      missed: missedData,
      daily: dailyData,
      monthly: monthlyData,
    };
  } catch (e) {
    return {};
  }
}

/**
 * Bootstrap synchronization endpoint.
 * Downloads structured business records in manageable chunks for offline availability.
 */
const bootstrapSync = asyncHandler(async (req, res) => {
  const { limit = 200, offset = 0, module } = req.query;
  const numLimit = Math.min(Number(limit) || 200, 500);
  const numOffset = Number(offset) || 0;

  const serverTime = new Date().toISOString();

  // Fast manifest endpoint returning server counts & metadata without heavy record payloads
  if (module === 'manifest' || module === 'meta') {
    const [
      totalCustomers,
      totalPlans,
      totalInstallments,
      totalPayments,
      totalInvestors,
      totalInvestorTransactions,
      totalWithdrawals,
      totalOwnerTransactions,
      totalFundingAllocations,
      settings,
      ownerProfit,
      ownerCapital,
      ownerFundedSummary,
      dashboard,
    ] = await Promise.all([
      Customer.countDocuments({ isDeleted: { $ne: true } }),
      InstallmentPlan.countDocuments({ isDeleted: { $ne: true } }),
      Installment.countDocuments({}),
      Payment.countDocuments({}),
      Investor.countDocuments({ isDeleted: { $ne: true } }),
      InvestorTransaction.countDocuments({}),
      Withdrawal.countDocuments({}),
      OwnerTransaction.countDocuments({}),
      FundingAllocation.countDocuments({}),
      BusinessSetting.findOne().catch(() => null),
      accountingService.getOwnerProfitSummary().catch(() => null),
      accountingService.getOwnerCapitalSummary().catch(() => null),
      ownerService.getOwnerFundedSummary().catch(() => null),
      getDashboardSummary().catch(() => null),
    ]);

    return res.json({
      success: true,
      serverTime,
      module: 'manifest',
      counts: {
        customers: totalCustomers,
        plans: totalPlans,
        installments: totalInstallments,
        payments: totalPayments,
        investors: totalInvestors,
        investorTransactions: totalInvestorTransactions,
        withdrawals: totalWithdrawals,
        ownerTransactions: totalOwnerTransactions,
        fundingAllocations: totalFundingAllocations,
      },
      settings: settings || {},
      ownerData: {
        profit: ownerProfit,
        capital: ownerCapital,
        fundedSummary: ownerFundedSummary,
      },
      dashboard: dashboard || {},
    });
  }

  // If client requested specific module chunk
  if (module === 'customers') {
    const [customers, total] = await Promise.all([
      Customer.find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      Customer.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'customers',
      total,
      hasMore: numOffset + customers.length < total,
      data: customers,
    });
  }

  if (module === 'plans') {
    const [plans, total] = await Promise.all([
      InstallmentPlan.find({ isDeleted: { $ne: true } })
        .populate('investorId', 'name investorId')
        .sort({ createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      InstallmentPlan.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'plans',
      total,
      hasMore: numOffset + plans.length < total,
      data: plans,
    });
  }

  if (module === 'installments') {
    const [installments, total] = await Promise.all([
      Installment.find({})
        .sort({ dueDate: 1 })
        .skip(numOffset)
        .limit(numLimit),
      Installment.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'installments',
      total,
      hasMore: numOffset + installments.length < total,
      data: installments,
    });
  }

  if (module === 'payments') {
    const [payments, total] = await Promise.all([
      Payment.find({})
        .populate('customerId', 'name contactNumber')
        .populate('installmentId', 'installmentNumber')
        .sort({ paymentDate: -1 })
        .skip(numOffset)
        .limit(numLimit),
      Payment.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'payments',
      total,
      hasMore: numOffset + payments.length < total,
      data: payments,
    });
  }

  if (module === 'investors') {
    const [investors, total] = await Promise.all([
      Investor.find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      Investor.countDocuments({ isDeleted: { $ne: true } }),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'investors',
      total,
      hasMore: numOffset + investors.length < total,
      data: investors,
    });
  }

  if (module === 'investorTransactions') {
    const [transactions, total] = await Promise.all([
      InvestorTransaction.find({})
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      InvestorTransaction.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'investorTransactions',
      total,
      hasMore: numOffset + transactions.length < total,
      data: transactions,
    });
  }

  if (module === 'withdrawals') {
    const [withdrawals, total] = await Promise.all([
      Withdrawal.find({})
        .populate('investorId', 'name investorId')
        .sort({ createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      Withdrawal.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'withdrawals',
      total,
      hasMore: numOffset + withdrawals.length < total,
      data: withdrawals,
    });
  }

  if (module === 'ownerTransactions') {
    const [transactions, total] = await Promise.all([
      OwnerTransaction.find({})
        .sort({ transactionDate: -1, createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      OwnerTransaction.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'ownerTransactions',
      total,
      hasMore: numOffset + transactions.length < total,
      data: transactions,
    });
  }

  if (module === 'fundingAllocations') {
    const [allocations, total] = await Promise.all([
      FundingAllocation.find({})
        .populate('investorId', 'name investorId')
        .sort({ createdAt: -1 })
        .skip(numOffset)
        .limit(numLimit),
      FundingAllocation.countDocuments({}),
    ]);
    return res.json({
      success: true,
      serverTime,
      module: 'fundingAllocations',
      total,
      hasMore: numOffset + allocations.length < total,
      data: allocations,
    });
  }

  // Default bootstrap: Comprehensive business records for complete offline enablement
  const [
    customers,
    plans,
    installments,
    payments,
    investors,
    investorTransactions,
    withdrawals,
    ownerTransactions,
    fundingAllocations,
    settings,
    ownerProfit,
    ownerCapital,
    ownerFundedSummary,
    dashboard,
  ] = await Promise.all([
    Customer.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .skip(numOffset)
      .limit(numLimit),
    InstallmentPlan.find({ isDeleted: { $ne: true } })
      .populate('investorId', 'name investorId')
      .sort({ createdAt: -1 })
      .limit(500),
    Installment.find({})
      .sort({ dueDate: 1 })
      .limit(1000),
    Payment.find({})
      .populate('customerId', 'name contactNumber')
      .populate('installmentId', 'installmentNumber')
      .sort({ paymentDate: -1 })
      .limit(500),
    Investor.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(100),
    InvestorTransaction.find({})
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(200),
    Withdrawal.find({})
      .populate('investorId', 'name investorId')
      .sort({ createdAt: -1 })
      .limit(100),
    OwnerTransaction.find({})
      .sort({ transactionDate: -1, createdAt: -1 })
      .limit(100),
    FundingAllocation.find({})
      .populate('investorId', 'name investorId')
      .sort({ createdAt: -1 })
      .limit(200),
    BusinessSetting.findOne().catch(() => null),
    accountingService.getOwnerProfitSummary().catch(() => null),
    accountingService.getOwnerCapitalSummary().catch(() => null),
    ownerService.getOwnerFundedSummary().catch(() => null),
    getDashboardSummary().catch(() => null),
  ]);

  const [
    totalCustomers,
    totalPlans,
    totalInstallments,
    totalPayments,
    totalInvestors,
    totalInvestorTransactions,
    totalWithdrawals,
    totalOwnerTransactions,
    totalFundingAllocations,
  ] = await Promise.all([
    Customer.countDocuments({ isDeleted: { $ne: true } }),
    InstallmentPlan.countDocuments({ isDeleted: { $ne: true } }),
    Installment.countDocuments({}),
    Payment.countDocuments({}),
    Investor.countDocuments({ isDeleted: { $ne: true } }),
    InvestorTransaction.countDocuments({}),
    Withdrawal.countDocuments({}),
    OwnerTransaction.countDocuments({}),
    FundingAllocation.countDocuments({}),
  ]);

  const hasMore =
    numOffset + customers.length < totalCustomers ||
    plans.length < totalPlans ||
    installments.length < totalInstallments ||
    payments.length < totalPayments ||
    investors.length < totalInvestors ||
    investorTransactions.length < totalInvestorTransactions ||
    withdrawals.length < totalWithdrawals ||
    ownerTransactions.length < totalOwnerTransactions ||
    fundingAllocations.length < totalFundingAllocations;

  const [investorSummaries, reports] = await Promise.all([
    computeInvestorSummaries(investors),
    computeCommonReports(plans, installments, payments),
  ]);

  res.json({
    success: true,
    serverTime,
    hasMore,
    counts: {
      customers: totalCustomers,
      plans: totalPlans,
      installments: totalInstallments,
      payments: totalPayments,
      investors: totalInvestors,
      investorTransactions: totalInvestorTransactions,
      withdrawals: totalWithdrawals,
      ownerTransactions: totalOwnerTransactions,
      fundingAllocations: totalFundingAllocations,
    },
    data: {
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
      fundingAllocations,
      settings: settings || {},
      ownerData: {
        profit: ownerProfit,
        capital: ownerCapital,
        fundedSummary: ownerFundedSummary,
      },
      dashboard,
      investorSummaries,
      reports,
    },
  });
});

/**
 * Delta synchronization endpoint.
 * Fetches only records updated or created since the last successful sync timestamp.
 */
const deltaSync = asyncHandler(async (req, res) => {
  const { since } = req.query;
  const serverTime = new Date().toISOString();

  if (!since) {
    return res.status(400).json({ success: false, message: 'The "since" timestamp parameter is required for delta sync.' });
  }

  const sinceDate = new Date(since);

  const [
    customers,
    plans,
    installments,
    payments,
    investors,
    investorTransactions,
    withdrawals,
    ownerTransactions,
    fundingAllocations,
    settings,
    ownerProfit,
    ownerCapital,
    ownerFundedSummary,
    dashboard,
  ] = await Promise.all([
    Customer.find({ updatedAt: { $gt: sinceDate } }),
    InstallmentPlan.find({ updatedAt: { $gt: sinceDate } }).populate('investorId', 'name investorId'),
    Installment.find({ updatedAt: { $gt: sinceDate } }),
    Payment.find({ createdAt: { $gt: sinceDate } }),
    Investor.find({ updatedAt: { $gt: sinceDate } }),
    InvestorTransaction.find({ createdAt: { $gt: sinceDate } }),
    Withdrawal.find({ createdAt: { $gt: sinceDate } }),
    OwnerTransaction.find({ createdAt: { $gt: sinceDate } }),
    FundingAllocation.find({ updatedAt: { $gt: sinceDate } }).populate('investorId', 'name investorId'),
    BusinessSetting.findOne({ updatedAt: { $gt: sinceDate } }).catch(() => null),
    accountingService.getOwnerProfitSummary().catch(() => null),
    accountingService.getOwnerCapitalSummary().catch(() => null),
    ownerService.getOwnerFundedSummary().catch(() => null),
    getDashboardSummary().catch(() => null),
  ]);

  const [investorSummaries, reports] = await Promise.all([
    computeInvestorSummaries(investors),
    computeCommonReports(plans, installments, payments),
  ]);

  res.json({
    success: true,
    serverTime,
    data: {
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
      fundingAllocations,
      settings,
      ownerData: {
        profit: ownerProfit,
        capital: ownerCapital,
        fundedSummary: ownerFundedSummary,
      },
      dashboard,
      investorSummaries,
      reports,
    },
  });
});

/**
 * Push offline operations queue to server.
 * Guarantees idempotency and strict financial integrity for every single operation.
 */
const pushSync = asyncHandler(async (req, res) => {
  const { operations = [] } = req.body;
  if (!Array.isArray(operations) || operations.length === 0) {
    return res.json({ success: true, results: [] });
  }

  const results = [];
  const idMap = new Map();

  // Helper to resolve client temporary IDs to authoritative MongoDB ObjectIds
  async function resolveInvestorId(id) {
    if (!id) return null;
    const str = String(id).trim();
    if (idMap.has(str)) return idMap.get(str);
    if (/^[0-9a-fA-F]{24}$/.test(str)) return str;
    const raw = str.replace(/^(temp_|local_)/, '');
    const inv = await Investor.findOne({ $or: [{ operationId: str }, { operationId: raw }, { investorId: str }] });
    if (inv) {
      idMap.set(str, String(inv._id));
      return String(inv._id);
    }
    return str;
  }

  async function resolveCustomerId(id) {
    if (!id) return null;
    const str = String(id).trim();
    if (idMap.has(str)) return idMap.get(str);
    if (/^[0-9a-fA-F]{24}$/.test(str)) return str;
    const raw = str.replace(/^(temp_|local_)/, '');
    const cust = await Customer.findOne({ $or: [{ operationId: str }, { operationId: raw }, { customerId: str }] });
    if (cust) {
      idMap.set(str, String(cust._id));
      return String(cust._id);
    }
    return str;
  }

  for (const op of operations) {
    const { operationId, type, payload } = op;
    if (!operationId) {
      results.push({
        status: 'ERROR',
        error: 'operationId is required for offline mutations.',
      });
      continue;
    }

    try {
      if (type === 'RECORD_PAYMENT') {
        const { installmentId, amount, paymentMethod, paymentDate, notes } = payload;
        const record = await recordPayment({
          installmentId,
          amount: Number(amount),
          paymentMethod,
          paymentDate,
          notes,
          operationId,
        });

        results.push({
          operationId,
          type,
          status: 'CONFIRMED',
          idempotentReplay: !!record.idempotentReplay,
          serverRecord: {
            payment: record.payment,
            installment: record.installment,
            plan: record.plan,
          },
        });
      } else if (type === 'CREATE_CUSTOMER') {
        const existing = await Customer.findOne({ operationId });
        if (existing) {
          idMap.set(operationId, String(existing._id));
          if (op.localId) idMap.set(op.localId, String(existing._id));
          if (op.tempId) idMap.set(op.tempId, String(existing._id));
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: true,
            serverRecord: existing,
          });
        } else {
          const customerId = await generateCustomerId();
          const customer = await Customer.create({
            ...payload,
            customerId,
            operationId,
          });
          idMap.set(operationId, String(customer._id));
          if (op.localId) idMap.set(op.localId, String(customer._id));
          if (op.tempId) idMap.set(op.tempId, String(customer._id));
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: false,
            serverRecord: customer,
          });
        }
      } else if (type === 'UPDATE_CUSTOMER') {
        const customer = await Customer.findById(payload._id || payload.id);
        if (!customer || customer.isDeleted) {
          results.push({
            operationId,
            type,
            status: 'ERROR',
            error: 'Customer not found or deleted on server.',
          });
          continue;
        }

        // Conflict check
        if (payload.lastKnownUpdatedAt) {
          const clientTimestamp = new Date(payload.lastKnownUpdatedAt).getTime();
          const serverTimestamp = new Date(customer.updatedAt).getTime();
          if (serverTimestamp > clientTimestamp + 2000) {
            results.push({
              operationId,
              type,
              status: 'CONFLICT',
              message: 'Customer was updated on another device in the interim.',
              serverRecord: customer,
            });
            continue;
          }
        }

        const { _id, id, customerId, isDeleted, createdAt, updatedAt, __v, lastKnownUpdatedAt, ...updatable } = payload;
        Object.assign(customer, updatable);
        await customer.save();

        results.push({
          operationId,
          type,
          status: 'CONFIRMED',
          serverRecord: customer,
        });
      } else if (type === 'DELETE_CUSTOMER' || type === 'ARCHIVE_CUSTOMER') {
        const targetCustomerId = await resolveCustomerId(payload._id || payload.id);
        const customer = await Customer.findById(targetCustomerId);
        if (!customer) {
          results.push({ operationId, type, status: 'CONFIRMED', idempotentReplay: true });
        } else {
          if (type === 'ARCHIVE_CUSTOMER') {
            customer.isArchived = true;
            await customer.save();
          } else {
            const activePlans = await InstallmentPlan.countDocuments({ customerId: customer._id, isDeleted: { $ne: true } });
            if (activePlans > 0) {
              results.push({ operationId, type, status: 'ERROR', error: 'Cannot delete customer with existing plans.' });
              continue;
            }
            customer.isDeleted = true;
            await customer.save();
          }
          results.push({ operationId, type, status: 'CONFIRMED', serverRecord: customer });
        }
      } else if (type === 'UPDATE_SETTINGS') {
        let settings = await BusinessSetting.findOne();
        if (!settings) settings = new BusinessSetting();
        const { _id, createdAt, updatedAt, __v, ...updatable } = payload;
        Object.assign(settings, updatable);
        await settings.save();

        results.push({
          operationId,
          type,
          status: 'CONFIRMED',
          serverRecord: settings,
        });
      } else if (type === 'CREATE_INVESTOR') {
        const existing = await Investor.findOne({ operationId });
        if (existing) {
          idMap.set(operationId, String(existing._id));
          if (op.localId) idMap.set(op.localId, String(existing._id));
          if (op.tempId) idMap.set(op.tempId, String(existing._id));
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: true,
            serverRecord: existing,
          });
        } else {
          const investorId = await generateInvestorId();
          const investor = await Investor.create({
            ...payload,
            investorId,
            operationId,
          });
          idMap.set(operationId, String(investor._id));
          if (op.localId) idMap.set(op.localId, String(investor._id));
          if (op.tempId) idMap.set(op.tempId, String(investor._id));
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            serverRecord: investor,
          });
        }
      } else if (type === 'UPDATE_INVESTOR') {
        const investor = await Investor.findById(payload._id || payload.id);
        if (!investor || investor.isDeleted) {
          results.push({
            operationId,
            type,
            status: 'ERROR',
            error: 'Investor not found or deleted on server.',
          });
          continue;
        }
        const { _id, id, investorId, isDeleted, createdAt, updatedAt, __v, lastKnownUpdatedAt, ...updatable } = payload;
        Object.assign(investor, updatable);
        await investor.save();
        results.push({
          operationId,
          type,
          status: 'CONFIRMED',
          serverRecord: investor,
        });
      } else if (type === 'ADD_INVESTOR_TRANSACTION') {
        const existing = await InvestorTransaction.findOne({ operationId });
        if (existing) {
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: true,
            serverRecord: existing,
          });
        } else {
          const { investorId, transactionType, amount, transactionDate, notes } = payload;
          const targetInvestorId = await resolveInvestorId(investorId);
          let normalizedType = transactionType;
          if (transactionType === 'PROFIT_CASH_WITHDRAWAL') normalizedType = 'PROFIT_WITHDRAWAL';

          const tx = await InvestorTransaction.create({
            investorId: targetInvestorId,
            transactionType: normalizedType,
            amount: Number(amount),
            transactionDate: transactionDate || new Date(),
            notes: notes || '',
            operationId,
          });
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            serverRecord: tx,
          });
        }
      } else if (type === 'ADD_OWNER_TRANSACTION') {
        const existing = await OwnerTransaction.findOne({ operationId });
        if (existing) {
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: true,
            serverRecord: existing,
          });
        } else {
          const { transactionType, amount, transactionDate, notes } = payload;
          let normalizedType = transactionType;
          if (transactionType === 'PROFIT_CASH_WITHDRAWAL') normalizedType = 'OWNER_WITHDRAWAL';
          if (transactionType === 'PROFIT_TO_CAPITAL') normalizedType = 'OWNER_PROFIT_TO_CAPITAL';

          const tx = await OwnerTransaction.create({
            transactionType: normalizedType,
            amount: Number(amount),
            transactionDate: transactionDate || new Date(),
            notes: notes || '',
            operationId,
          });
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            serverRecord: tx,
          });
        }
      } else if (type === 'RECORD_WITHDRAWAL') {
        const existing = await Withdrawal.findOne({ operationId });
        if (existing) {
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            idempotentReplay: true,
            serverRecord: existing,
          });
        } else {
          const { investorId, totalAmount, notes, reference, withdrawalDate, withdrawalType } = payload;
          const targetInvestorId = await resolveInvestorId(investorId);
          const half = Number(totalAmount) / 2;
          const w = await Withdrawal.create({
            investorId: targetInvestorId,
            totalAmount: Number(totalAmount),
            ownerAmount: half,
            investorAmount: half,
            notes: notes || '',
            reference: reference || '',
            withdrawalDate: withdrawalDate || new Date(),
            withdrawalType: withdrawalType || 'PROFIT_CASH',
            operationId,
          });
          results.push({
            operationId,
            type,
            status: 'CONFIRMED',
            serverRecord: w,
          });
        }
      } else {
        results.push({
          operationId,
          type,
          status: 'ERROR',
          error: `Unsupported sync operation type: ${type}`,
        });
      }
    } catch (err) {
      results.push({
        operationId,
        type,
        status: 'ERROR',
        error: err.message || 'Operation failed during sync processing.',
      });
    }
  }

  res.json({
    success: true,
    serverTime: new Date().toISOString(),
    results,
  });
});

module.exports = {
  bootstrapSync,
  deltaSync,
  pushSync,
};
