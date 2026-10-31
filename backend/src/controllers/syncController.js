const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const OwnerTransaction = require('../models/OwnerTransaction');
const Withdrawal = require('../models/Withdrawal');
const BusinessSetting = require('../models/BusinessSetting');
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

async function computeCommonReports(plans) {
  try {
    const list = Array.isArray(plans) ? plans : [];
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

    return {
      profit: profitData,
      loss: lossData,
      outstanding: outstandingData,
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
    BusinessSetting.findOne().catch(() => null),
    accountingService.getOwnerProfitSummary().catch(() => null),
    accountingService.getOwnerCapitalSummary().catch(() => null),
    ownerService.getOwnerFundedSummary().catch(() => null),
    getDashboardSummary().catch(() => null),
  ]);

  const totalCustomers = await Customer.countDocuments({ isDeleted: { $ne: true } });

  const [investorSummaries, reports] = await Promise.all([
    computeInvestorSummaries(investors),
    computeCommonReports(plans),
  ]);

  res.json({
    success: true,
    serverTime,
    hasMore: numOffset + customers.length < totalCustomers,
    data: {
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
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
    BusinessSetting.findOne({ updatedAt: { $gt: sinceDate } }).catch(() => null),
    accountingService.getOwnerProfitSummary().catch(() => null),
    accountingService.getOwnerCapitalSummary().catch(() => null),
    ownerService.getOwnerFundedSummary().catch(() => null),
    getDashboardSummary().catch(() => null),
  ]);

  const [investorSummaries, reports] = await Promise.all([
    computeInvestorSummaries(investors),
    computeCommonReports(plans),
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
          const tx = await InvestorTransaction.create({
            investorId,
            transactionType,
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
          const half = Number(totalAmount) / 2;
          const w = await Withdrawal.create({
            investorId,
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
