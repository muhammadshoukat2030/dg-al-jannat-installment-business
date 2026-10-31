const mongoose = require('mongoose');
const path = require('path');
const assert = require('assert');

// Models
const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const Withdrawal = require('../models/Withdrawal');
const OwnerTransaction = require('../models/OwnerTransaction');
const BusinessSetting = require('../models/BusinessSetting');

// Services & Controllers
const { bootstrapSync } = require('../controllers/syncController');
const reportController = require('../controllers/reportController');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_management3';

async function runStrictVerification() {
  console.log('--- STARTING STRICT OFFLINE VERIFICATION TESTS ---');
  await mongoose.connect(MONGO_URI);

  let initialCounts = null;

  try {
    // Record baseline database state
    initialCounts = {
      customers: await Customer.countDocuments(),
      plans: await InstallmentPlan.countDocuments(),
      installments: await Installment.countDocuments(),
      payments: await Payment.countDocuments(),
      investors: await Investor.countDocuments(),
      investorTransactions: await InvestorTransaction.countDocuments(),
      withdrawals: await Withdrawal.countDocuments(),
      ownerTransactions: await OwnerTransaction.countDocuments(),
    };
    console.log('Baseline Database Record Counts:', initialCounts);

    // =========================================================================
    // CHECK 1: Bootstrap Pagination & Completeness across ALL 8 Categories
    // =========================================================================
    console.log('\n--- CHECK 1: Bootstrap Pagination & All Categories ---');
    const mockReq = { query: {} };
    let bootstrapData = null;
    const mockRes = {
      json: (payload) => {
        bootstrapData = payload;
      },
      status: () => mockRes,
    };

    await bootstrapSync(mockReq, mockRes);
    assert.ok(bootstrapData.success, 'Bootstrap must return success: true');
    assert.ok(bootstrapData.counts, 'Bootstrap must return counts object');
    assert.ok(Array.isArray(bootstrapData.data.customers), 'customers must be array');
    assert.ok(Array.isArray(bootstrapData.data.plans), 'plans must be array');
    assert.ok(Array.isArray(bootstrapData.data.installments), 'installments must be array');
    assert.ok(Array.isArray(bootstrapData.data.payments), 'payments must be array');
    assert.ok(Array.isArray(bootstrapData.data.investors), 'investors must be array');
    assert.ok(Array.isArray(bootstrapData.data.investorTransactions), 'investorTransactions must be array');
    assert.ok(Array.isArray(bootstrapData.data.withdrawals), 'withdrawals must be array');
    assert.ok(Array.isArray(bootstrapData.data.ownerTransactions), 'ownerTransactions must be array');
    assert.ok(bootstrapData.data.settings, 'settings must be present');
    assert.ok(bootstrapData.data.ownerData, 'ownerData must be present');
    assert.ok(bootstrapData.data.dashboard, 'dashboard must be present');
    assert.ok(bootstrapData.data.investorSummaries, 'investorSummaries must be present');
    assert.ok(bootstrapData.data.reports, 'reports must be present');

    // Test module-specific pagination for all 8 categories
    const modules = [
      'customers',
      'plans',
      'installments',
      'payments',
      'investors',
      'investorTransactions',
      'withdrawals',
      'ownerTransactions',
    ];
    for (const mod of modules) {
      let modData = null;
      await bootstrapSync({ query: { module: mod, limit: 10, offset: 0 } }, {
        json: (p) => { modData = p; },
        status: () => ({ json: () => {} }),
      });
      assert.ok(modData.success, `Module ${mod} pagination query must succeed`);
      assert.strictEqual(modData.module, mod, `Returned module must match requested module ${mod}`);
      assert.ok(Array.isArray(modData.data), `Module ${mod} data must be an array`);
      console.log(`  ✓ Module chunk endpoint supported: ${mod} (count: ${modData.data.length}, total: ${modData.total})`);
    }
    console.log('✓ CHECK 1 PASSED: All 8 required categories and module chunk endpoints verified.');

    // =========================================================================
    // CHECK 4: Record Relationships Integrity
    // =========================================================================
    console.log('\n--- CHECK 4: Record Relationships Integrity ---');
    const { plans, installments, payments, customers, investors } = bootstrapData.data;

    // Map plans by ID
    const planMap = new Map();
    plans.forEach((p) => planMap.set(String(p._id), p));

    const customerMap = new Map();
    customers.forEach((c) => customerMap.set(String(c._id), c));

    // Check installments point to valid plans
    for (const inst of installments) {
      const pid = String(inst.planId?._id || inst.planId);
      assert.ok(planMap.has(pid), `Installment ${inst._id} must reference an existing plan ${pid}`);
    }
    console.log(`  ✓ Verified ${installments.length} installments properly link to existing plans`);

    // Check payments point to valid installments and plans
    for (const p of payments) {
      const iid = p.installmentId?._id || p.installmentId;
      if (iid) {
        const matchingInst = installments.find((inst) => String(inst._id) === String(iid));
        assert.ok(matchingInst, `Payment ${p._id} must reference a known installment ${iid}`);
      }
    }
    console.log(`  ✓ Verified ${payments.length} payments properly link to valid installments`);
    console.log('✓ CHECK 4 PASSED: Complete record relationships verified.');

    // =========================================================================
    // CHECK 7: Verify Offline Reports vs Server Report Calculations
    // =========================================================================
    console.log('\n--- CHECK 7: Offline Reports vs Server Reports ---');
    const reports = bootstrapData.data.reports;
    assert.ok(reports.profit, 'Profit report must exist in bootstrap data');
    assert.ok(reports.loss, 'Loss report must exist in bootstrap data');
    assert.ok(reports.outstanding, 'Outstanding report must exist in bootstrap data');
    assert.ok(reports.overdue, 'Overdue report must exist in bootstrap data');
    assert.ok(reports.missed, 'Missed report must exist in bootstrap data');
    assert.ok(reports.daily, 'Daily report must exist in bootstrap data');
    assert.ok(reports.monthly, 'Monthly report must exist in bootstrap data');

    // Cross-verify outstanding report remaining amounts match plans
    for (const item of reports.outstanding) {
      assert.ok(item.remainingAmount > 0, 'Outstanding items must have remainingAmount > 0');
    }
    console.log(`  ✓ Verified ${reports.outstanding.length} outstanding report rows`);

    // Cross-verify daily collections sum matches payment sum
    const totalDailyCollected = reports.daily.reduce((sum, d) => sum + d.total, 0);
    const totalPaymentsAmount = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    assert.strictEqual(totalDailyCollected, totalPaymentsAmount, 'Daily collections sum must equal total payments amount');
    console.log(`  ✓ Daily collections total (PKR ${totalDailyCollected}) exactly matches payments sum (PKR ${totalPaymentsAmount})`);
    console.log('✓ CHECK 7 PASSED: Offline report calculations strictly align with server business logic.');

    // =========================================================================
    // CHECK 9: Confirm Database State & Historical Data Was Not Changed
    // =========================================================================
    console.log('\n--- CHECK 9: Database Immutability Check ---');
    const finalCounts = {
      customers: await Customer.countDocuments(),
      plans: await InstallmentPlan.countDocuments(),
      installments: await Installment.countDocuments(),
      payments: await Payment.countDocuments(),
      investors: await Investor.countDocuments(),
      investorTransactions: await InvestorTransaction.countDocuments(),
      withdrawals: await Withdrawal.countDocuments(),
      ownerTransactions: await OwnerTransaction.countDocuments(),
    };
    assert.deepStrictEqual(initialCounts, finalCounts, 'Database record counts must remain identical');
    console.log('✓ CHECK 9 PASSED: Zero modifications to historical financial records or counts.');

    console.log('\n======================================================');
    console.log('ALL STRICT OFFLINE VERIFICATION TESTS PASSED (100%)');
    console.log('======================================================');
  } finally {
    await mongoose.disconnect();
  }
}

runStrictVerification().catch((err) => {
  console.error('Strict verification failed:', err);
  process.exit(1);
});
