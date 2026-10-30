/**
 * Owner Funding Service Tests
 * Tests getOwnerFundedSummary, getOwnerFundedCustomers, getOwnerFundedContracts
 * against real DB. Uses installment_management3 DB (read-only queries only).
 */
const mongoose = require('mongoose');
const ownerService = require('../services/ownerService');

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/installment_management3');
  console.log('Connected to DB');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  // Test 1: funded summary returns expected shape
  await test('getOwnerFundedSummary returns valid shape', async () => {
    const summary = await ownerService.getOwnerFundedSummary();
    if (typeof summary.customersFunded !== 'number') throw new Error('customersFunded must be a number');
    if (typeof summary.contractsFunded !== 'number') throw new Error('contractsFunded must be a number');
    if (typeof summary.totalCapitalDeployed !== 'number') throw new Error('totalCapitalDeployed must be a number');
    if (summary.totalCapitalDeployed < 0) throw new Error('totalCapitalDeployed cannot be negative');
    if (summary.totalCollections < 0) throw new Error('totalCollections cannot be negative');
    if (summary.totalOutstanding < 0) throw new Error('totalOutstanding cannot be negative');
  });

  // Test 2: funded customers returns valid shape
  await test('getOwnerFundedCustomers returns paginated result', async () => {
    const result = await ownerService.getOwnerFundedCustomers({ page: 1, limit: 10 });
    if (!Array.isArray(result.data)) throw new Error('data must be an array');
    if (typeof result.total !== 'number') throw new Error('total must be a number');
    if (typeof result.pages !== 'number') throw new Error('pages must be a number');
    for (const row of result.data) {
      if (typeof row.contractsFunded !== 'number') throw new Error('contractsFunded must be a number');
      if (typeof row.deployed !== 'number') throw new Error('deployed must be a number');
    }
  });

  // Test 3: funded contracts returns valid shape
  await test('getOwnerFundedContracts returns paginated result', async () => {
    const result = await ownerService.getOwnerFundedContracts({ page: 1, limit: 10 });
    if (!Array.isArray(result.data)) throw new Error('data must be an array');
    if (typeof result.total !== 'number') throw new Error('total must be a number');
  });

  // Test 4: search filter works
  await test('getOwnerFundedContracts search filter returns array', async () => {
    const result = await ownerService.getOwnerFundedContracts({ search: 'XXXXXX_NONEXISTENT', page: 1, limit: 10 });
    if (!Array.isArray(result.data)) throw new Error('data must be an array');
    if (result.data.length !== 0) throw new Error('Should return 0 results for nonexistent search');
  });

  // Test 5: status filter works
  await test('getOwnerFundedContracts status filter works', async () => {
    const result = await ownerService.getOwnerFundedContracts({ status: 'ACTIVE', page: 1, limit: 100 });
    if (!Array.isArray(result.data)) throw new Error('data must be an array');
    for (const p of result.data) {
      if (p.status !== 'ACTIVE') throw new Error(`Expected status ACTIVE but got ${p.status}`);
    }
  });

  // Test 6: customersFunded matches funded customers total
  await test('customersFunded from summary matches funded customers query', async () => {
    const [summary, customers] = await Promise.all([
      ownerService.getOwnerFundedSummary(),
      ownerService.getOwnerFundedCustomers({ page: 1, limit: 10000 }),
    ]);
    if (summary.customersFunded !== customers.total) {
      throw new Error(`Mismatch: summary.customersFunded=${summary.customersFunded} vs customers.total=${customers.total}`);
    }
  });

  console.log(`\nOwner Funding Tests: ${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
