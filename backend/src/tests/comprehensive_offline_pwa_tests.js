const mongoose = require('mongoose');
const assert = require('assert');

// Models
const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');

// Services and Controllers
const { recordPayment } = require('../services/installmentService');
const { bootstrapSync, deltaSync, pushSync } = require('../controllers/syncController');
const { updateCustomer } = require('../controllers/customerController');

async function runComprehensiveTests() {
  const TEST_URI = 'mongodb://127.0.0.1:27017/installment_management3_pwa_test';
  await mongoose.connect(TEST_URI);
  console.log('Connected to DB for Comprehensive Offline-First PWA & Financial Integrity Tests\n');

  try {
    // Clean test collections
    await Promise.all([
      Customer.deleteMany({}),
      InstallmentPlan.deleteMany({}),
      Installment.deleteMany({}),
      Payment.deleteMany({}),
      Investor.deleteMany({}),
      InvestorTransaction.deleteMany({}),
    ]);

    // -------------------------------------------------------------
    // SCENARIO 1: Seed Initial Business Data
    // -------------------------------------------------------------
    console.log('--- SCENARIO 1: First-Time Online Application Bootstrap Sync ---');
    const cust1 = await Customer.create({
      customerId: 'CUST-001',
      name: 'Ahmed Khan',
      contactNumber: '03001112233',
      city: 'Islamabad',
    });

    const cust2 = await Customer.create({
      customerId: 'CUST-002',
      name: 'Bilal Tariq',
      contactNumber: '03214445566',
      city: 'Rawalpindi',
    });

    const plan1 = await InstallmentPlan.create({
      contractId: 'PLAN-001',
      customerId: cust1._id,
      productName: 'Samsung Galaxy S24',
      purchaseCost: 200000,
      sellingPrice: 260000,
      downPayment: 60000,
      remainingAmount: 200000,
      monthlyInstallment: 20000,
      installmentDurationMonths: 10,
      startDate: new Date(),
      firstDueDate: new Date(),
      status: 'ACTIVE',
    });

    const inst1 = await Installment.create({
      planId: plan1._id,
      customerId: cust1._id,
      installmentNumber: 1,
      monthLabel: 'Month 1',
      dueDate: new Date(),
      amountDue: 20000,
      paidAmount: 0,
      remainingAmount: 20000,
      status: 'PENDING',
    });

    const inst2 = await Installment.create({
      planId: plan1._id,
      customerId: cust1._id,
      installmentNumber: 2,
      monthLabel: 'Month 2',
      dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      amountDue: 20000,
      paidAmount: 0,
      remainingAmount: 20000,
      status: 'PENDING',
    });

    const investor1 = await Investor.create({
      investorId: 'INV-001',
      name: 'Rashid Ali',
      phone: '03335556677',
      totalInvested: 500000,
      capitalAvailable: 500000,
    });

    // Mock Express res for bootstrapSync
    let bootstrapData = null;
    const reqMock = { query: { limit: 100 } };
    const resMock = { json: (d) => { bootstrapData = d; return d; }, status: () => resMock };

    await bootstrapSync(reqMock, resMock);

    assert(bootstrapData.success, 'Bootstrap must return success: true');
    assert.strictEqual(bootstrapData.data.customers.length, 2, 'Must include both customers');
    assert.strictEqual(bootstrapData.data.plans.length, 1, 'Must include plan');
    assert.strictEqual(bootstrapData.data.installments.length, 2, 'Must include installments');
    assert.strictEqual(bootstrapData.data.investors.length, 1, 'Must include investor');
    console.log('✓ Scenario 1: Initial bootstrap download contains all required business records for offline caching');

    // -------------------------------------------------------------
    // SCENARIO 2: Offline Payment Recording & Idempotent Push
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 2: Safe Offline Payment & Server Idempotency ---');
    const opIdPayment = 'op_offline_pay_777';

    // Simulate batch push of offline payment
    let pushResponse = null;
    const pushReqMock = {
      body: {
        operations: [
          {
            operationId: opIdPayment,
            type: 'RECORD_PAYMENT',
            payload: {
              installmentId: inst1._id.toString(),
              amount: 20000,
              paymentMethod: 'Cash',
              paymentDate: new Date().toISOString(),
              notes: 'Collected offline at store',
            },
          },
        ],
      },
    };
    const pushResMock = { json: (d) => { pushResponse = d; return d; }, status: () => pushResMock };

    await pushSync(pushReqMock, pushResMock);

    assert(pushResponse.success, 'Push sync must succeed');
    const payResult = pushResponse.results[0];
    assert.strictEqual(payResult.status, 'CONFIRMED');
    assert.strictEqual(payResult.idempotentReplay, false);
    assert.strictEqual(payResult.serverRecord.payment.amount, 20000);
    assert.strictEqual(payResult.serverRecord.installment.status, 'PAID');

    // Verify installment state in DB
    const updatedInst1 = await Installment.findById(inst1._id);
    assert.strictEqual(updatedInst1.paidAmount, 20000);
    assert.strictEqual(updatedInst1.status, 'PAID');

    // Verify plan balance in DB
    const updatedPlan1 = await InstallmentPlan.findById(plan1._id);
    assert.strictEqual(updatedPlan1.remainingAmount, 180000);
    console.log('✓ Scenario 2A: Offline payment processed and confirmed by server');

    // -------------------------------------------------------------
    // SCENARIO 3: Network Interruption / Retry of Same Operation
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 3: Re-transmission & Duplicate Payment Prevention ---');
    let duplicatePushResponse = null;
    const dupResMock = { json: (d) => { duplicatePushResponse = d; return d; }, status: () => dupResMock };

    // Same batch sent again (simulating browser re-sending unconfirmed queue)
    await pushSync(pushReqMock, dupResMock);

    assert(duplicatePushResponse.success);
    const dupResult = duplicatePushResponse.results[0];
    assert.strictEqual(dupResult.status, 'CONFIRMED');
    assert.strictEqual(dupResult.idempotentReplay, true, 'Server must recognize duplicate operationId and return replay');

    // Verify Payment table: MUST HAVE ONLY 1 RECORD
    const paymentsCount = await Payment.countDocuments({ operationId: opIdPayment });
    assert.strictEqual(paymentsCount, 1, 'Payment record must NEVER be duplicated!');

    // Verify Plan balance: MUST STILL BE 180,000 (NOT 160,000)
    const planAfterDup = await InstallmentPlan.findById(plan1._id);
    assert.strictEqual(planAfterDup.remainingAmount, 180000, 'Customer balance must NEVER be deducted twice!');
    console.log('✓ Scenario 3: Duplicate payment prevented; exact balance and single payment preserved');

    // -------------------------------------------------------------
    // SCENARIO 4: Offline Customer Creation
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 4: Offline Customer Registration ---');
    const opIdCust = 'op_offline_cust_555';
    let custPushResponse = null;
    const custPushReq = {
      body: {
        operations: [
          {
            operationId: opIdCust,
            type: 'CREATE_CUSTOMER',
            payload: {
              name: 'Usman Ghani',
              contactNumber: '03459998877',
              cnic: '37405-1234567-1',
              city: 'Peshawar',
            },
          },
        ],
      },
    };
    await pushSync(custPushReq, { json: (d) => { custPushResponse = d; return d; }, status: () => resMock });

    assert(custPushResponse.success);
    const custRes = custPushResponse.results[0];
    assert.strictEqual(custRes.status, 'CONFIRMED');
    assert(custRes.serverRecord.customerId.startsWith('CUST-'), 'Authoritative customerId must be generated');

    const createdInDb = await Customer.findOne({ operationId: opIdCust });
    assert(createdInDb, 'Customer must be durably saved in MongoDB');
    assert.strictEqual(createdInDb.name, 'Usman Ghani');
    console.log(`✓ Scenario 4: Customer registered offline created with authoritative ID: ${createdInDb.customerId}`);

    // -------------------------------------------------------------
    // SCENARIO 5: Data Conflict Handling
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 5: Data Conflict Detection ---');
    // Simulate Customer 1 updated on device B at 10:00 AM
    cust1.notes = 'Updated on Device B';
    cust1.updatedAt = new Date(Date.now() + 5000); // 5 seconds ahead
    await cust1.save();

    // Now device A sends an update made at an earlier timestamp
    const opIdConflict = 'op_conflict_test_111';
    let conflictPushResponse = null;
    const conflictPushReq = {
      body: {
        operations: [
          {
            operationId: opIdConflict,
            type: 'UPDATE_CUSTOMER',
            payload: {
              _id: cust1._id.toString(),
              notes: 'Stale update from Device A',
              lastKnownUpdatedAt: new Date(Date.now() - 60000).toISOString(), // 1 min ago
            },
          },
        ],
      },
    };
    await pushSync(conflictPushReq, { json: (d) => { conflictPushResponse = d; return d; }, status: () => resMock });

    const conflictResult = conflictPushResponse.results[0];
    assert.strictEqual(conflictResult.status, 'CONFLICT', 'Conflict must be explicitly detected!');
    assert(conflictResult.message.includes('another device'));

    // Verify DB record was NOT overwritten by stale offline update
    const preservedCust = await Customer.findById(cust1._id);
    assert.strictEqual(preservedCust.notes, 'Updated on Device B', 'Newer server record must NOT be blindly overwritten!');
    console.log('✓ Scenario 5: Conflict accurately detected; newer server record preserved');

    // -------------------------------------------------------------
    // SCENARIO 6: Delta Synchronization
    // -------------------------------------------------------------
    console.log('\n--- SCENARIO 6: Delta Sync Since Timestamp ---');
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    let deltaResponse = null;
    await deltaSync(
      { query: { since: oneMinuteAgo } },
      { json: (d) => { deltaResponse = d; return d; }, status: () => resMock }
    );

    assert(deltaResponse.success);
    assert(deltaResponse.data.payments.length >= 1, 'Delta must include newly recorded payment');
    assert(deltaResponse.data.customers.length >= 2, 'Delta must include newly created and updated customers');
    console.log(`✓ Scenario 6: Delta sync successfully fetched ${deltaResponse.data.payments.length} payments & ${deltaResponse.data.customers.length} customers modified since timestamp`);

    console.log('\n======================================================');
    console.log('ALL 6 COMPREHENSIVE PWA & FINANCIAL SAFETY SUITES PASSED');
    console.log('======================================================\n');
  } finally {
    await mongoose.connection.close();
  }
}

runComprehensiveTests().catch((err) => {
  console.error('TEST RUNNER FAILED:', err);
  process.exit(1);
});
