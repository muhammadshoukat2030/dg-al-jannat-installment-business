const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const asyncHandler = require('../middleware/asyncHandler');
const { recordPayment } = require('../services/installmentService');
const { generateCustomerId } = require('../utils/idGenerator');
const { getDashboardSummary } = require('../services/dashboardService');

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

  // Default bootstrap: Essential core data for initial offline enablement
  const [customers, plans, installments, payments, investors, dashboard] = await Promise.all([
    Customer.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .skip(numOffset)
      .limit(numLimit),
    InstallmentPlan.find({ isDeleted: { $ne: true } })
      .populate('investorId', 'name investorId')
      .sort({ createdAt: -1 })
      .limit(300),
    Installment.find({})
      .sort({ dueDate: 1 })
      .limit(600),
    Payment.find({})
      .sort({ paymentDate: -1 })
      .limit(300),
    Investor.find({ isDeleted: { $ne: true } })
      .sort({ createdAt: -1 })
      .limit(100),
    getDashboardSummary().catch(() => null),
  ]);

  const totalCustomers = await Customer.countDocuments({ isDeleted: { $ne: true } });

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
      dashboard,
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

  const [customers, plans, installments, payments, investors] = await Promise.all([
    Customer.find({ updatedAt: { $gt: sinceDate } }),
    InstallmentPlan.find({ updatedAt: { $gt: sinceDate } }).populate('investorId', 'name investorId'),
    Installment.find({ updatedAt: { $gt: sinceDate } }),
    Payment.find({ createdAt: { $gt: sinceDate } }),
    Investor.find({ updatedAt: { $gt: sinceDate } }),
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
