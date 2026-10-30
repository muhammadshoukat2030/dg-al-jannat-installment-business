const mongoose = require('mongoose');
const assert = require('assert');

// Models
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const OwnerTransaction = require('../models/OwnerTransaction');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');

async function runTargetedTests() {
  const TEST_URI = 'mongodb://127.0.0.1:27017/installment_management3_targeted_test';
  await mongoose.connect(TEST_URI);
  console.log('Connected to test DB for targeted ledger validation.');

  try {
    // ---------------------------------------------------------
    // TEST 1: Invest 10,000, Return 10,000 -> Capital Held must be EXACTLY 0 (NEVER -10,000 or negative)
    // ---------------------------------------------------------
    console.log('\n--- Scenario 1: Invest 10k, Return 10k -> Capital Held = 0 ---');
    const inv1 = await Investor.create({
      investorId: 'INV-TEST-01',
      name: 'Test Investor 1',
      phone: '03001111111',
    });

    // 1. Initial Investment 10,000
    await InvestorTransaction.create({
      investorId: inv1._id,
      transactionType: 'INVESTMENT_IN',
      amount: 10000,
      notes: 'Initial investment',
      createdAt: new Date(),
    });

    let summary1 = await investorService.getInvestorCapitalSummary(inv1._id);
    assert.strictEqual(summary1.originalCapitalInvested, 10000);
    assert.strictEqual(summary1.additionalCapitalAdded, 0);
    assert.strictEqual(summary1.totalCapitalAdded, 10000);
    assert.strictEqual(summary1.totalCapitalReturned, 0);
    assert.strictEqual(summary1.capitalHeld, 10000);
    assert.strictEqual(summary1.capitalAvailable, 10000);
    console.log('✓ Initial 10k invested: Capital Held = 10,000, Available = 10,000');

    // 2. Return full 10,000
    await InvestorTransaction.create({
      investorId: inv1._id,
      transactionType: 'RETURN_TO_INVESTOR',
      amount: 10000,
      createdAt: new Date(),
    });

    summary1 = await investorService.getInvestorCapitalSummary(inv1._id);
    assert.strictEqual(summary1.originalCapitalInvested, 10000);
    assert.strictEqual(summary1.totalCapitalAdded, 10000);
    assert.strictEqual(summary1.totalCapitalReturned, 10000);
    assert.strictEqual(summary1.capitalHeld, 0, 'Capital Held must be EXACTLY 0 when returning full capital');
    assert.strictEqual(summary1.capitalAvailable, 0, 'Capital Available must be 0');
    console.log('✓ Full 10k returned: Capital Held = 0 (EXACTLY ZERO, NOT NEGATIVE), Available = 0');

    // ---------------------------------------------------------
    // TEST 2: The Hamza Discrepancy Scenario (Invest 10k, Profit to Capital 1.5k, Return 11k -> Capital Held = 500)
    // ---------------------------------------------------------
    console.log('\n--- Scenario 2: Invest 10k + Profit to Capital 1.5k + Return 11k ---');
    const inv2 = await Investor.create({
      investorId: 'INV-TEST-02',
      name: 'Test Investor 2 (Hamza Case)',
      phone: '03002222222',
    });

    // 1. Initial Investment 10,000
    await InvestorTransaction.create({
      investorId: inv2._id,
      transactionType: 'INVESTMENT_IN',
      amount: 10000,
      notes: 'Initial investment',
      createdAt: new Date('2026-10-01'),
    });

    // 2. Transfer 1,500 profit to capital
    await InvestorTransaction.create({
      investorId: inv2._id,
      transactionType: 'PROFIT_TO_CAPITAL',
      amount: 1500,
      createdAt: new Date('2026-10-05'),
    });

    let summary2 = await investorService.getInvestorCapitalSummary(inv2._id);
    assert.strictEqual(summary2.totalCapitalInjected, 11500);
    assert.strictEqual(summary2.capitalHeld, 11500);
    assert.strictEqual(summary2.capitalAvailable, 11500);
    console.log('✓ 10k invested + 1.5k profit transferred = 11.5k Capital Held and Available');

    // 3. Return 11,000 capital
    await InvestorTransaction.create({
      investorId: inv2._id,
      transactionType: 'RETURN_TO_INVESTOR',
      amount: 11000,
      createdAt: new Date('2026-10-10'),
    });

    summary2 = await investorService.getInvestorCapitalSummary(inv2._id);
    assert.strictEqual(summary2.totalCapitalAdded, 10000);
    assert.strictEqual(summary2.profitTransferredToCapital, 1500);
    assert.strictEqual(summary2.totalCapitalInjected, 11500);
    assert.strictEqual(summary2.totalCapitalReturned, 11000);
    assert.strictEqual(summary2.capitalHeld, 500, 'Capital Held must be 500 (11,500 - 11,000), NEVER -1,000');
    assert.strictEqual(summary2.capitalAvailable, 500);
    console.log('✓ 11k returned: Capital Held = 500 (POSSIBLE AND POSITIVE, NOT -1,000), Available = 500');

    // ---------------------------------------------------------
    // TEST 3: Partial Return & Additional Capital Added
    // ---------------------------------------------------------
    console.log('\n--- Scenario 3: Additional Capital & Partial Return ---');
    // Add additional capital 5,000
    await InvestorTransaction.create({
      investorId: inv2._id,
      transactionType: 'INVESTMENT_IN',
      amount: 5000,
      notes: 'Top-up capital',
      createdAt: new Date('2026-10-15'),
    });

    summary2 = await investorService.getInvestorCapitalSummary(inv2._id);
    assert.strictEqual(summary2.originalCapitalInvested, 10000);
    assert.strictEqual(summary2.additionalCapitalAdded, 5000);
    assert.strictEqual(summary2.totalCapitalAdded, 15000);
    assert.strictEqual(summary2.totalCapitalInjected, 16500); // 15000 + 1500
    assert.strictEqual(summary2.totalCapitalReturned, 11000);
    assert.strictEqual(summary2.capitalHeld, 5500); // 16500 - 11000
    assert.strictEqual(summary2.capitalAvailable, 5500);
    console.log('✓ 5k additional added: Capital Held = 5,500, Available = 5,500');

    // ---------------------------------------------------------
    // TEST 4: Owner Capital & Profit Balance Verification
    // ---------------------------------------------------------
    console.log('\n--- Scenario 4: Owner Capital Accounting ---');
    // 1. Owner adds initial capital 20,000
    await OwnerTransaction.create({
      transactionType: 'CAPITAL_IN',
      amount: 20000,
      notes: 'Initial owner injection',
      createdAt: new Date('2026-10-01'),
    });

    let ownerCap = await accountingService.getOwnerCapitalSummary();
    assert.strictEqual(ownerCap.originalCapitalInvested, 20000);
    assert.strictEqual(ownerCap.capitalHeld, 20000);
    assert.strictEqual(ownerCap.capitalAvailable, 20000);

    // 2. Owner returns 20,000 full capital
    await OwnerTransaction.create({
      transactionType: 'CAPITAL_RETURNED',
      amount: 20000,
      createdAt: new Date('2026-10-05'),
    });

    ownerCap = await accountingService.getOwnerCapitalSummary();
    assert.strictEqual(ownerCap.capitalHeld, 0, 'Owner Capital Held must be EXACTLY 0');
    assert.strictEqual(ownerCap.capitalAvailable, 0, 'Owner Available Capital must be 0');
    console.log('✓ Owner added 20k, returned 20k: Capital Held = 0 (EXACTLY ZERO), Available = 0');

    // 3. Owner profit to capital 3,000
    await OwnerTransaction.create({
      transactionType: 'OWNER_PROFIT_TO_CAPITAL',
      amount: 3000,
      createdAt: new Date('2026-10-10'),
    });

    ownerCap = await accountingService.getOwnerCapitalSummary();
    assert.strictEqual(ownerCap.profitTransferredToCapital, 3000);
    assert.strictEqual(ownerCap.capitalHeld, 3000);
    assert.strictEqual(ownerCap.capitalAvailable, 3000);
    console.log('✓ Owner transferred 3k profit: Capital Held = 3,000, Available = 3,000');

    console.log('\n======================================================');
    console.log('ALL TARGETED LEDGER & DISCREPANCY TESTS PASSED CLEANLY');
    console.log('======================================================\n');
  } finally {
    await mongoose.connection.db.dropDatabase();
    await mongoose.disconnect();
  }
}

runTargetedTests().catch((err) => {
  console.error('Targeted test failed:', err);
  process.exit(1);
});
