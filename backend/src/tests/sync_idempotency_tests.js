const mongoose = require('mongoose');
const assert = require('assert');

const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const { recordPayment } = require('../services/installmentService');
const { pushSync, bootstrapSync, deltaSync } = require('../controllers/syncController');

async function runSyncTests() {
  const TEST_URI = 'mongodb://127.0.0.1:27017/installment_management3_sync_test';
  await mongoose.connect(TEST_URI);
  console.log('Connected to DB for Offline Sync & Idempotency Tests');

  try {
    // Clean test collections
    await Promise.all([
      Customer.deleteMany({}),
      InstallmentPlan.deleteMany({}),
      Installment.deleteMany({}),
      Payment.deleteMany({}),
    ]);

    // 1. Setup a test customer, plan, and installment
    const customer = await Customer.create({
      customerId: 'CUST-SYNC-01',
      name: 'Sync Test Customer',
      contactNumber: '03001234567',
    });

    const plan = await InstallmentPlan.create({
      contractId: 'PLAN-SYNC-01',
      customerId: customer._id,
      productName: 'Test Phone',
      purchaseCost: 40000,
      sellingPrice: 60000,
      downPayment: 10000,
      remainingAmount: 50000,
      monthlyInstallment: 5000,
      installmentDurationMonths: 10,
      status: 'ACTIVE',
      startDate: new Date(),
      firstDueDate: new Date(),
    });

    const installment = await Installment.create({
      customerId: customer._id,
      planId: plan._id,
      installmentNumber: 1,
      monthLabel: 'Month 1',
      dueDate: new Date(),
      amountDue: 5000,
      paidAmount: 0,
      remainingAmount: 5000,
      status: 'PENDING',
    });

    console.log('--- Test 1: Record payment with unique operationId ---');
    const opId1 = 'op-pay-12345-abcde';
    const result1 = await recordPayment({
      installmentId: installment._id,
      amount: 5000,
      paymentMethod: 'Cash',
      notes: 'Initial offline payment sync',
      operationId: opId1,
    });

    assert.strictEqual(result1.payment.amount, 5000);
    assert.strictEqual(result1.payment.operationId, opId1);
    assert.strictEqual(result1.installment.paidAmount, 5000);
    assert.strictEqual(result1.installment.status, 'PAID');
    assert.strictEqual(result1.plan.totalPaid, 5000);
    assert.strictEqual(result1.plan.remainingAmount, 45000);
    assert.strictEqual(result1.idempotentReplay, undefined);
    console.log('✓ Payment successfully recorded with operationId');

    console.log('\n--- Test 2: Idempotent replay of same payment (re-transmitted / network retry) ---');
    const result2 = await recordPayment({
      installmentId: installment._id,
      amount: 5000,
      paymentMethod: 'Cash',
      notes: 'Initial offline payment sync - DUPLICATE RETRY',
      operationId: opId1,
    });

    assert.strictEqual(result2.idempotentReplay, true);
    assert.strictEqual(result2.payment._id.toString(), result1.payment._id.toString());
    assert.strictEqual(result2.payment.receiptNumber, result1.payment.receiptNumber);

    // Verify database count of Payment: MUST REMAIN EXACTLY 1!
    const paymentCount = await Payment.countDocuments({ operationId: opId1 });
    assert.strictEqual(paymentCount, 1, 'Payment must NOT be duplicated!');

    // Verify installment state: paidAmount MUST REMAIN 5000, NOT 10000!
    const reloadedInst = await Installment.findById(installment._id);
    assert.strictEqual(reloadedInst.paidAmount, 5000, 'Installment paid amount must NOT be doubled!');

    // Verify plan balance: remaining MUST REMAIN 45000, NOT 40000!
    const reloadedPlan = await InstallmentPlan.findById(plan._id);
    assert.strictEqual(reloadedPlan.remainingAmount, 45000, 'Plan remaining amount must NOT be reduced twice!');
    console.log('✓ Idempotency strictly guaranteed: exactly 1 payment record, balance unchanged, idempotentReplay returned');

    console.log('\n--- Test 3: Batch offline pushSync with payments and customer creations ---');
    const inst2 = await Installment.create({
      customerId: customer._id,
      planId: plan._id,
      installmentNumber: 2,
      monthLabel: 'Month 2',
      dueDate: new Date(),
      amountDue: 5000,
      paidAmount: 0,
      remainingAmount: 5000,
      status: 'PENDING',
    });

    const opIdPay2 = 'op-pay-batch-999';
    const opIdCust = 'op-cust-batch-888';

    // Mock Express request/response for pushSync
    let responseData = null;
    const reqMock = {
      body: {
        operations: [
          {
            operationId: opIdPay2,
            type: 'RECORD_PAYMENT',
            payload: {
              installmentId: inst2._id.toString(),
              amount: 5000,
              paymentMethod: 'Bank Transfer',
              notes: 'Batch offline payment',
            },
          },
          {
            operationId: opIdCust,
            type: 'CREATE_CUSTOMER',
            payload: {
              name: 'Offline Customer 2',
              contactNumber: '03112223334',
              city: 'Lahore',
            },
          },
          // Send duplicate of opId1 in the same batch to ensure batch handling of duplicate replays
          {
            operationId: opId1,
            type: 'RECORD_PAYMENT',
            payload: {
              installmentId: installment._id.toString(),
              amount: 5000,
            },
          },
        ],
      },
    };

    const resMock = {
      json: (data) => {
        responseData = data;
        return data;
      },
      status: () => resMock,
    };

    await pushSync(reqMock, resMock);

    assert(responseData.success, 'pushSync must return success: true');
    assert.strictEqual(responseData.results.length, 3, 'Must return 3 results');

    // Check opIdPay2
    const resPay2 = responseData.results.find((r) => r.operationId === opIdPay2);
    assert.strictEqual(resPay2.status, 'CONFIRMED');
    assert.strictEqual(resPay2.idempotentReplay, false);

    // Check opIdCust
    const resCust = responseData.results.find((r) => r.operationId === opIdCust);
    assert.strictEqual(resCust.status, 'CONFIRMED');
    assert.strictEqual(resCust.serverRecord.name, 'Offline Customer 2');

    // Check opId1 in batch
    const resDuplicate = responseData.results.find((r) => r.operationId === opId1);
    assert.strictEqual(resDuplicate.status, 'CONFIRMED');
    assert.strictEqual(resDuplicate.idempotentReplay, true);
    console.log('✓ Batch pushSync successfully processed payments, offline customers, and duplicate replays');

    console.log('\n=============================================');
    console.log('ALL OFFLINE SYNC & IDEMPOTENCY TESTS PASSED!');
    console.log('=============================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

runSyncTests().catch((err) => {
  console.error('TEST FAILED:', err);
  process.exit(1);
});
