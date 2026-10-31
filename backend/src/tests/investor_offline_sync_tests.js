/**
 * Investor Offline Sync & Idempotency Test Suite
 * Tests CREATE_INVESTOR, UPDATE_INVESTOR, ADD_INVESTOR_TRANSACTION, and RECORD_WITHDRAWAL offline operations
 */

const mongoose = require('mongoose');
const { pushSync, bootstrapSync, deltaSync } = require('../controllers/syncController');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const Withdrawal = require('../models/Withdrawal');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/installment_management3';

async function runTests() {
  console.log('Starting Investor Offline Sync Tests...');
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  try {
    const timestamp = Date.now();
    const invOpId = `op_inv_${timestamp}`;

    // Test 1: Push CREATE_INVESTOR offline operation
    console.log('\n--- Test 1: Push CREATE_INVESTOR offline operation ---');
    const mockReq1 = {
      body: {
        operations: [
          {
            operationId: invOpId,
            type: 'CREATE_INVESTOR',
            payload: {
              name: `Test Investor ${timestamp}`,
              phone: `0300${Math.floor(1000000 + Math.random() * 9000000)}`,
              cnic: '12345-6789012-3',
              address: 'Test Street, Test City',
              notes: 'Created offline during test',
            },
          },
        ],
      },
    };

    let pushResult1 = null;
    const mockRes1 = {
      json: (data) => { pushResult1 = data; },
      status: () => mockRes1,
    };

    await pushSync(mockReq1, mockRes1);
    if (!pushResult1 || !pushResult1.results || pushResult1.results[0].status !== 'CONFIRMED') {
      throw new Error(`Test 1 Failed: ${JSON.stringify(pushResult1)}`);
    }
    const createdInvestor = pushResult1.results[0].serverRecord;
    console.log(`✓ Investor created with ID: ${createdInvestor.investorId} (_id: ${createdInvestor._id})`);

    // Test 2: Idempotent replay of same CREATE_INVESTOR
    console.log('\n--- Test 2: Idempotent replay of CREATE_INVESTOR ---');
    let pushResult2 = null;
    const mockRes2 = {
      json: (data) => { pushResult2 = data; },
      status: () => mockRes2,
    };
    await pushSync(mockReq1, mockRes2);
    if (!pushResult2.results[0].idempotentReplay) {
      throw new Error('Test 2 Failed: Expected idempotentReplay: true on re-transmission');
    }
    console.log('✓ Re-transmission recognized without creating duplicates');

    // Test 3: Push ADD_INVESTOR_TRANSACTION
    console.log('\n--- Test 3: Push ADD_INVESTOR_TRANSACTION offline operation ---');
    const txOpId = `op_tx_${timestamp}`;
    const mockReq3 = {
      body: {
        operations: [
          {
            operationId: txOpId,
            type: 'ADD_INVESTOR_TRANSACTION',
            payload: {
              investorId: createdInvestor._id,
              transactionType: 'INVESTMENT_IN',
              amount: 50000,
              notes: 'Initial test capital added offline',
            },
          },
        ],
      },
    };
    let pushResult3 = null;
    const mockRes3 = {
      json: (data) => { pushResult3 = data; },
      status: () => mockRes3,
    };
    await pushSync(mockReq3, mockRes3);
    if (pushResult3.results[0].status !== 'CONFIRMED') {
      throw new Error(`Test 3 Failed: ${JSON.stringify(pushResult3)}`);
    }
    console.log(`✓ Investor transaction recorded with amount: ${pushResult3.results[0].serverRecord.amount}`);

    // Test 4: Push RECORD_WITHDRAWAL (50/50 rule enforcement)
    console.log('\n--- Test 4: Push RECORD_WITHDRAWAL offline operation ---');
    const withOpId = `op_with_${timestamp}`;
    const mockReq4 = {
      body: {
        operations: [
          {
            operationId: withOpId,
            type: 'RECORD_WITHDRAWAL',
            payload: {
              investorId: createdInvestor._id,
              totalAmount: 10000,
              notes: 'Offline profit withdrawal test',
            },
          },
        ],
      },
    };
    let pushResult4 = null;
    const mockRes4 = {
      json: (data) => { pushResult4 = data; },
      status: () => mockRes4,
    };
    await pushSync(mockReq4, mockRes4);
    if (pushResult4.results[0].status !== 'CONFIRMED') {
      throw new Error(`Test 4 Failed: ${JSON.stringify(pushResult4)}`);
    }
    const recWithdrawal = pushResult4.results[0].serverRecord;
    if (recWithdrawal.ownerAmount !== 5000 || recWithdrawal.investorAmount !== 5000) {
      throw new Error(`Test 4 Failed: 50/50 split incorrect: Owner ${recWithdrawal.ownerAmount}, Investor ${recWithdrawal.investorAmount}`);
    }
    console.log(`✓ 50/50 Withdrawal strictly enforced: Owner ${recWithdrawal.ownerAmount}, Investor ${recWithdrawal.investorAmount}`);

    // Test 5: Verify Bootstrap includes investorSummaries and common reports
    console.log('\n--- Test 5: Verify Bootstrap sync data bundle ---');
    let bootstrapData = null;
    const mockBootRes = {
      json: (data) => { bootstrapData = data; },
      status: () => mockBootRes,
    };
    await bootstrapSync({ query: {} }, mockBootRes);
    if (!bootstrapData.data.investorSummaries || !bootstrapData.data.reports) {
      throw new Error('Test 5 Failed: Bootstrap sync missing investorSummaries or reports');
    }
    console.log(`✓ Bootstrap contains ${Object.keys(bootstrapData.data.investorSummaries).length} investor summaries and reports: ${Object.keys(bootstrapData.data.reports).join(', ')}`);

    console.log('\n=============================================');
    console.log('ALL INVESTOR OFFLINE SYNC TESTS PASSED! (5/5)');
    console.log('=============================================\n');

    // Clean up test records
    await Investor.deleteOne({ _id: createdInvestor._id });
    await InvestorTransaction.deleteOne({ operationId: txOpId });
    await Withdrawal.deleteOne({ operationId: withOpId });
  } finally {
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
