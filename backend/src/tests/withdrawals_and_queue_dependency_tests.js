/**
 * Withdrawals CORS, Populate & Offline Write Queue Dependency Resolution Tests
 */

const http = require('http');
const mongoose = require('mongoose');
const app = require('../app');
const { isAllowedOrigin } = require('../utils/corsHelper');
const { getWithdrawals } = require('../controllers/ownerController');
const { pushSync } = require('../controllers/syncController');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const Withdrawal = require('../models/Withdrawal');
const Customer = require('../models/Customer');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/installment_management3';

async function runTests() {
  console.log('--- Starting Withdrawals, CORS & Write Queue Dependency Tests ---');
  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const createdCleanupIds = {
    investors: [],
    investorTransactions: [],
    withdrawals: [],
    customers: [],
  };

  try {
    // ----------------------------------------------------
    // TEST 1: CORS Origin Validation
    // ----------------------------------------------------
    console.log('\n--- TEST 1: CORS Origin Validation ---');
    const validOrigins = [
      'https://dg-al-jannat-installment-business-v.vercel.app',
      'https://dg-al-jannat-installment-business.vercel.app',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
    ];

    for (const origin of validOrigins) {
      const allowed = isAllowedOrigin(origin);
      if (!allowed) {
        throw new Error(`Expected origin ${origin} to be allowed, but was rejected.`);
      }
      console.log(`  ✓ Origin allowed: ${origin}`);
    }

    const invalidOrigin = 'https://malicious-site.com';
    if (isAllowedOrigin(invalidOrigin)) {
      throw new Error(`Expected origin ${invalidOrigin} to be blocked, but was allowed.`);
    }
    console.log(`  ✓ Malicious origin blocked: ${invalidOrigin}`);

    // Test live CORS headers via HTTP server
    const server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    const corsRes = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dg-al-jannat-installment-business-v.vercel.app',
        'Access-Control-Request-Method': 'GET',
      },
    });

    const allowHeader = corsRes.headers.get('access-control-allow-origin');
    if (allowHeader !== 'https://dg-al-jannat-installment-business-v.vercel.app') {
      throw new Error(`Expected Access-Control-Allow-Origin header to match, got: ${allowHeader}`);
    }
    console.log('  ✓ HTTP OPTIONS request returned correct Access-Control-Allow-Origin');
    server.close();

    // ----------------------------------------------------
    // TEST 2: Withdrawals API & Populate (Error A verification)
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Withdrawals API & Populate Schema Resolution ---');
    const mockReq = {
      query: { page: 1, limit: 10 },
    };
    let mockResult = null;
    let mockStatusCode = 200;
    const mockRes = {
      status: (code) => {
        mockStatusCode = code;
        return mockRes;
      },
      json: (data) => {
        mockResult = data;
      },
    };

    await getWithdrawals(mockReq, mockRes);
    if (!mockResult || !mockResult.success) {
      throw new Error(`getWithdrawals returned error: ${JSON.stringify(mockResult)}`);
    }
    console.log(`  ✓ getWithdrawals executed successfully without MissingSchemaError: found ${mockResult.total} withdrawals`);

    // ----------------------------------------------------
    // TEST 3: Offline Write Queue Dependency Resolution (Error D verification)
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Offline Write Queue Temporary ID Resolution ---');
    const timestamp = Date.now();
    const tempInvId = `temp_inv_${timestamp}`;
    const invOpId = `op_inv_${timestamp}`;
    const txOpId = `op_tx_${timestamp}`;
    const wdOpId = `op_wd_${timestamp}`;

    const tempCustId = `temp_cust_${timestamp}`;
    const custOpId = `op_cust_${timestamp}`;
    const archiveOpId = `op_arch_${timestamp}`;

    const batchOperations = [
      // 1. Create investor with temp ID
      {
        operationId: invOpId,
        tempId: tempInvId,
        localId: tempInvId,
        type: 'CREATE_INVESTOR',
        payload: {
          name: `Queue Dep Investor ${timestamp}`,
          phone: `0311${Math.floor(1000000 + Math.random() * 9000000)}`,
          cnic: '32101-1234567-9',
          address: 'Test Dep City',
        },
      },
      // 2. Add transaction referencing temp investor ID
      {
        operationId: txOpId,
        type: 'ADD_INVESTOR_TRANSACTION',
        payload: {
          investorId: tempInvId,
          transactionType: 'INVESTMENT_IN',
          amount: 75000,
          notes: 'Testing temp ID resolution in queue',
        },
      },
      // 3. Record withdrawal referencing temp investor ID
      {
        operationId: wdOpId,
        type: 'RECORD_WITHDRAWAL',
        payload: {
          investorId: tempInvId,
          totalAmount: 10000,
          withdrawalType: 'PROFIT_CASH',
          notes: 'Testing temp ID resolution in withdrawal',
        },
      },
      // 4. Create customer with temp ID
      {
        operationId: custOpId,
        tempId: tempCustId,
        localId: tempCustId,
        type: 'CREATE_CUSTOMER',
        payload: {
          name: `Queue Dep Customer ${timestamp}`,
          contactNumber: `0322${Math.floor(1000000 + Math.random() * 9000000)}`,
          cnic: '32101-9876543-1',
          address: 'Test Cust City',
        },
      },
      // 5. Archive customer referencing temp customer ID
      {
        operationId: archiveOpId,
        type: 'ARCHIVE_CUSTOMER',
        payload: {
          id: tempCustId,
        },
      },
    ];

    let pushResult = null;
    const mockSyncRes = {
      json: (data) => {
        pushResult = data;
      },
      status: () => mockSyncRes,
    };

    await pushSync({ body: { operations: batchOperations } }, mockSyncRes);

    if (!pushResult || !pushResult.success) {
      throw new Error(`pushSync failed: ${JSON.stringify(pushResult)}`);
    }

    const { results } = pushResult;
    console.log(`  ✓ Received ${results.length} operation results from batch pushSync`);

    // Verify all 5 operations succeeded
    for (const res of results) {
      if (res.status !== 'CONFIRMED') {
        throw new Error(`Operation ${res.operationId} (${res.type}) failed: ${res.error}`);
      }
      console.log(`  ✓ Operation ${res.type} CONFIRMED`);
    }

    // Verify the dependent transaction points to the real MongoDB _id
    const confirmedInvestor = results.find((r) => r.type === 'CREATE_INVESTOR').serverRecord;
    const confirmedTx = results.find((r) => r.type === 'ADD_INVESTOR_TRANSACTION').serverRecord;
    const confirmedWd = results.find((r) => r.type === 'RECORD_WITHDRAWAL').serverRecord;
    const confirmedCust = results.find((r) => r.type === 'CREATE_CUSTOMER').serverRecord;

    if (String(confirmedTx.investorId) !== String(confirmedInvestor._id)) {
      throw new Error(`Transaction investorId (${confirmedTx.investorId}) does not match created Investor _id (${confirmedInvestor._id})`);
    }
    console.log(`  ✓ InvestorTransaction correctly resolved tempId to real ObjectId: ${confirmedTx.investorId}`);

    if (String(confirmedWd.investorId) !== String(confirmedInvestor._id)) {
      throw new Error(`Withdrawal investorId (${confirmedWd.investorId}) does not match created Investor _id (${confirmedInvestor._id})`);
    }
    console.log(`  ✓ Withdrawal correctly resolved tempId to real ObjectId: ${confirmedWd.investorId}`);

    // Verify customer was archived
    const fetchedCust = await Customer.findById(confirmedCust._id);
    if (!fetchedCust || !fetchedCust.isArchived) {
      throw new Error(`Expected customer ${confirmedCust._id} to be archived.`);
    }
    console.log(`  ✓ Customer correctly resolved tempId and set isArchived: true`);

    // Register for cleanup
    createdCleanupIds.investors.push(confirmedInvestor._id);
    createdCleanupIds.investorTransactions.push(confirmedTx._id);
    createdCleanupIds.withdrawals.push(confirmedWd._id);
    createdCleanupIds.customers.push(confirmedCust._id);

    console.log('\n======================================================');
    console.log('ALL WITHDRAWALS, CORS & QUEUE DEPENDENCY TESTS PASSED!');
    console.log('======================================================');
  } finally {
    // Clean up temporary test data
    if (createdCleanupIds.investors.length) {
      await Investor.deleteMany({ _id: { $in: createdCleanupIds.investors } });
    }
    if (createdCleanupIds.investorTransactions.length) {
      await InvestorTransaction.deleteMany({ _id: { $in: createdCleanupIds.investorTransactions } });
    }
    if (createdCleanupIds.withdrawals.length) {
      await Withdrawal.deleteMany({ _id: { $in: createdCleanupIds.withdrawals } });
    }
    if (createdCleanupIds.customers.length) {
      await Customer.deleteMany({ _id: { $in: createdCleanupIds.customers } });
    }
    await mongoose.disconnect();
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
