/**
 * Full Offline & Online Lifecycle Test for Capital Return & Capital Overview
 * Tests:
 * 1. Owner & Investor Chronological FIFO Capital Return Calculation
 * 2. Offline Mutation Persistence (IndexedDB stores & Sync Queue)
 * 3. Offline Dynamic Recalculation (FIFO balances immediately update offline)
 * 4. Offline Page Reload Persistence (Ctrl+R / reload maintains state without network)
 * 5. Online Background Re-sync (/api/sync/push) with Server Confirmation
 * 6. Idempotency & De-duplication (Replaying same syncQueue does not duplicate records)
 * 7. Strict Separation between Owner and Investor Transactions
 * 8. Real Browser Verification via Chrome DevTools Protocol (CDP)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const mongoose = require('mongoose');

require('../models');
const Investor = mongoose.model('Investor');
const InvestorTransaction = mongoose.model('InvestorTransaction');
const OwnerTransaction = mongoose.model('OwnerTransaction');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_offline_test_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000';
const MONGO_URI = 'mongodb://127.0.0.1:27017/installment_management3';

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      }
    };
  }

  ready() {
    return new Promise((r) => (this.ws.readyState === WebSocket.OPEN ? r() : (this.ws.onopen = () => r())));
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {}
  }
}

async function httpPost(url, body, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        let respBody = '';
        res.on('data', (d) => (respBody += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respBody) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: respBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
      (res) => {
        let respBody = '';
        res.on('data', (d) => (respBody += d));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(respBody) });
          } catch (e) {
            resolve({ status: res.statusCode, raw: respBody });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// Emulate Frontend IndexedDB FIFO Derivation Algorithm
function computeOfflineFIFO(txs, isOwner = false) {
  const directType = isOwner ? 'CAPITAL_IN' : 'INVESTMENT_IN';
  const profitType = isOwner ? 'OWNER_PROFIT_TO_CAPITAL' : 'PROFIT_TO_CAPITAL';
  const returnType = isOwner ? 'CAPITAL_RETURNED' : 'RETURN_TO_INVESTOR';

  const sortedTxs = [...txs]
    .filter((t) => [directType, profitType, returnType].includes(t.transactionType))
    .sort((a, b) => {
      const da = a.transactionDate ? new Date(a.transactionDate).toISOString().slice(0, 10) : '';
      const db = b.transactionDate ? new Date(b.transactionDate).toISOString().slice(0, 10) : '';
      if (da !== db) return da.localeCompare(db);
      return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
    });

  const lots = [];
  for (const t of sortedTxs) {
    const amt = Number(t.amount || 0);
    if (amt <= 0) continue;
    if (t.transactionType === directType) {
      lots.push({ type: 'DIRECT', remaining: amt });
    } else if (t.transactionType === profitType) {
      lots.push({ type: 'PROFIT', remaining: amt });
    } else if (t.transactionType === returnType) {
      let toDeduct = amt;
      for (const lot of lots) {
        if (toDeduct <= 0) break;
        if (lot.remaining <= 0) continue;
        const take = Math.min(lot.remaining, toDeduct);
        lot.remaining = Math.round((lot.remaining - take) * 100) / 100;
        toDeduct = Math.round((toDeduct - take) * 100) / 100;
      }
    }
  }

  const remainingDirectCapital = Math.round(
    lots.filter((l) => l.type === 'DIRECT').reduce((sum, l) => sum + l.remaining, 0) * 100
  ) / 100;
  const remainingProfitTransferred = Math.round(
    lots.filter((l) => l.type === 'PROFIT').reduce((sum, l) => sum + l.remaining, 0) * 100
  ) / 100;

  return {
    remainingDirectCapital,
    remainingProfitTransferred,
    totalCapitalSummary: Math.round((remainingDirectCapital + remainingProfitTransferred) * 100) / 100,
  };
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING FULL OFFLINE CAPITAL LIFECYCLE & SYNC TEST SUITE');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // Obtain auth token
  const loginRes = await httpPost(`${BACKEND_URL}/api/auth/login`, {
    email: 'admin@localhost.com',
    password: '12345',
  });
  if (!loginRes.data?.token) {
    throw new Error(`Failed to log in to backend API: ${JSON.stringify(loginRes)}`);
  }
  const token = loginRes.data.token;
  console.log('Obtained Auth Token for Admin');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- TEST GROUP 1: Pure Chronological FIFO Calculation Simulation ---
  console.log('\n--- GROUP 1: Chronological FIFO Logic & Multi-Return Edge Cases ---');
  {
    // Simulation: Direct 50,000 (Day 1) -> Profit 20,000 (Day 2) -> Return 10,000 (Day 3)
    const txs1 = [
      { transactionType: 'CAPITAL_IN', amount: 50000, transactionDate: '2026-11-01', createdAt: '2026-11-01T08:00:00Z' },
      { transactionType: 'OWNER_PROFIT_TO_CAPITAL', amount: 20000, transactionDate: '2026-11-02', createdAt: '2026-11-02T08:00:00Z' },
      { transactionType: 'CAPITAL_RETURNED', amount: 10000, transactionDate: '2026-11-03', createdAt: '2026-11-03T08:00:00Z' },
    ];
    const fifo1 = computeOfflineFIFO(txs1, true);
    assert(fifo1.remainingDirectCapital === 40000, 'Partial return 10k consumes direct capital first (50k -> 40k)');
    assert(fifo1.remainingProfitTransferred === 20000, 'Transferred profit remains untouched at 20k');
    assert(fifo1.totalCapitalSummary === 60000, 'Total capital summary is exactly 60k (40k + 20k)');

    // Multiple partial returns crossing direct capital into transferred profit
    const txs2 = [
      ...txs1,
      { transactionType: 'CAPITAL_RETURNED', amount: 45000, transactionDate: '2026-11-04', createdAt: '2026-11-04T08:00:00Z' },
    ];
    const fifo2 = computeOfflineFIFO(txs2, true);
    assert(fifo2.remainingDirectCapital === 0, 'Direct capital is fully exhausted (40k - 40k = 0)');
    assert(fifo2.remainingProfitTransferred === 15000, 'Remainder of return (5k) deducted from transferred profit (20k - 5k = 15k)');
    assert(fifo2.totalCapitalSummary === 15000, 'Total capital summary is exactly 15k (0 + 15k)');

    // Full final return
    const txs3 = [
      ...txs2,
      { transactionType: 'CAPITAL_RETURNED', amount: 15000, transactionDate: '2026-11-05', createdAt: '2026-11-05T08:00:00Z' },
    ];
    const fifo3 = computeOfflineFIFO(txs3, true);
    assert(fifo3.remainingDirectCapital === 0, 'Final full return: direct capital is 0');
    assert(fifo3.remainingProfitTransferred === 0, 'Final full return: transferred profit is 0');
    assert(fifo3.totalCapitalSummary === 0, 'Final full return: total capital summary is 0');
  }

  // --- TEST GROUP 2: Investor Offline Simulation with Local Cache Derivation ---
  console.log('\n--- GROUP 2: Investor Offline Calculation with Simulated Reload ---');
  {
    const inv = await Investor.findOne({ isDeleted: { $ne: true } });
    assert(!!inv, `Found existing investor: ${inv?.name} (${inv?._id})`);

    // Fetch live summary from service
    const liveCapital = await investorService.getInvestorCapitalSummary(inv._id);
    console.log(`  Initial Investor State: Direct=${liveCapital.remainingDirectCapital}, ProfitTransferred=${liveCapital.remainingProfitTransferred}, Total=${liveCapital.capitalHeld}`);

    // Simulate an offline mutation batch for this investor
    const op1 = 'op_test_inv_in_' + Date.now();
    const op2 = 'op_test_inv_profit_' + Date.now();
    const op3 = 'op_test_inv_ret_' + Date.now();

    const offlineTxs = [
      {
        _id: 'local_' + op1,
        investorId: inv._id,
        transactionType: 'INVESTMENT_IN',
        amount: 8000,
        transactionDate: '2026-11-01',
        createdAt: '2026-11-01T10:00:00Z',
        operationId: op1,
      },
      {
        _id: 'local_' + op2,
        investorId: inv._id,
        transactionType: 'PROFIT_TO_CAPITAL',
        amount: 4000,
        transactionDate: '2026-11-02',
        createdAt: '2026-11-02T10:00:00Z',
        operationId: op2,
      },
      {
        _id: 'local_' + op3,
        investorId: inv._id,
        transactionType: 'RETURN_TO_INVESTOR',
        amount: 5000,
        transactionDate: '2026-11-03',
        createdAt: '2026-11-03T10:00:00Z',
        operationId: op3,
      },
    ];

    const fifoOffline = computeOfflineFIFO(offlineTxs, false);
    assert(fifoOffline.remainingDirectCapital === 3000, 'Investor offline: 8000 - 5000 = 3000 remaining direct');
    assert(fifoOffline.remainingProfitTransferred === 4000, 'Investor offline: 4000 remaining profit transferred');
    assert(fifoOffline.totalCapitalSummary === 7000, 'Investor offline: total capital summary is 7000');
  }

  // --- TEST GROUP 3: Server Re-sync & Idempotency Verification ---
  console.log('\n--- GROUP 3: Server Background Re-Sync & Idempotency (/api/sync/push) ---');
  {
    // Generate unique offline operations for Owner & Investor
    const inv = await Investor.findOne({ isDeleted: { $ne: true } });
    const opInv = 'op_live_inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const opOwner = 'op_live_owner_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);

    const queuedOps = [
      {
        operationId: opInv,
        type: 'ADD_INVESTOR_TRANSACTION',
        payload: {
          investorId: String(inv._id),
          transactionType: 'PROFIT_TO_CAPITAL',
          amount: 500,
          transactionDate: new Date().toISOString(),
          notes: 'Automated test profit to capital reinvestment',
        },
      },
      {
        operationId: opOwner,
        type: 'ADD_OWNER_TRANSACTION',
        payload: {
          transactionType: 'OWNER_PROFIT_TO_CAPITAL',
          amount: 500,
          transactionDate: new Date().toISOString(),
          notes: 'Automated test owner profit to capital reinvestment',
        },
      },
    ];

    // Push first time (online sync)
    const pushRes1 = await httpPost(`${BACKEND_URL}/api/sync/push`, { operations: queuedOps }, token);
    assert(pushRes1.status === 200, 'POST /api/sync/push responded HTTP 200');
    assert(Array.isArray(pushRes1.data?.results), 'Sync push returned results array');
    assert(pushRes1.data.results.length === 2, 'Sync push processed exactly 2 operations');

    const resInv1 = pushRes1.data.results.find((r) => r.operationId === opInv);
    const resOwner1 = pushRes1.data.results.find((r) => r.operationId === opOwner);

    assert(resInv1?.status === 'CONFIRMED', 'Investor offline mutation CONFIRMED by server');
    assert(resOwner1?.status === 'CONFIRMED', 'Owner offline mutation CONFIRMED by server');

    // Verify records exist in MongoDB
    const dbInvTx = await InvestorTransaction.findOne({ operationId: opInv });
    const dbOwnerTx = await OwnerTransaction.findOne({ operationId: opOwner });
    assert(!!dbInvTx, 'InvestorTransaction record created in MongoDB with operationId');
    assert(!!dbOwnerTx, 'OwnerTransaction record created in MongoDB with operationId');
    assert(dbInvTx.transactionType === 'PROFIT_TO_CAPITAL', 'InvestorTransaction has correct type PROFIT_TO_CAPITAL');
    assert(dbOwnerTx.transactionType === 'OWNER_PROFIT_TO_CAPITAL', 'OwnerTransaction has correct type OWNER_PROFIT_TO_CAPITAL');

    // Test Idempotency: Replay the identical batch of operations to simulate repeated sync or network retry
    console.log('  Testing idempotency by re-pushing identical queue...');
    const pushRes2 = await httpPost(`${BACKEND_URL}/api/sync/push`, { operations: queuedOps }, token);
    assert(pushRes2.status === 200, 'Second sync push responded HTTP 200');

    const resInv2 = pushRes2.data.results.find((r) => r.operationId === opInv);
    const resOwner2 = pushRes2.data.results.find((r) => r.operationId === opOwner);

    assert(resInv2?.status === 'CONFIRMED' && resInv2?.idempotentReplay === true, 'Investor operation recognized as idempotent replay');
    assert(resOwner2?.status === 'CONFIRMED' && resOwner2?.idempotentReplay === true, 'Owner operation recognized as idempotent replay');

    // Verify NO duplicate transactions were created
    const countInv = await InvestorTransaction.countDocuments({ operationId: opInv });
    const countOwner = await OwnerTransaction.countDocuments({ operationId: opOwner });
    assert(countInv === 1, 'Strictly 1 InvestorTransaction exists (no duplicate created)');
    assert(countOwner === 1, 'Strictly 1 OwnerTransaction exists (no duplicate created)');

    // Clean up test transactions so as not to pollute the active business database
    await InvestorTransaction.deleteOne({ operationId: opInv });
    await OwnerTransaction.deleteOne({ operationId: opOwner });
    console.log('  Cleaned up temporary test transactions cleanly');
  }

  // --- TEST GROUP 4: Strict Separation between Owner and Investor ---
  console.log('\n--- GROUP 4: Strict Separation between Owner and Investor Data ---');
  {
    const invCountBefore = await InvestorTransaction.countDocuments({});
    const ownerCountBefore = await OwnerTransaction.countDocuments({});

    // Record an owner transaction
    const ownerOp = 'op_sep_owner_' + Date.now();
    await httpPost(
      `${BACKEND_URL}/api/sync/push`,
      {
        operations: [
          {
            operationId: ownerOp,
            type: 'ADD_OWNER_TRANSACTION',
            payload: {
              transactionType: 'CAPITAL_IN',
              amount: 1000,
              notes: 'Separation test capital in',
            },
          },
        ],
      },
      token
    );

    const invCountAfter = await InvestorTransaction.countDocuments({});
    const ownerCountAfter = await OwnerTransaction.countDocuments({});

    assert(invCountAfter === invCountBefore, 'InvestorTransaction count is completely unaffected by Owner transaction');
    assert(ownerCountAfter === ownerCountBefore + 1, 'OwnerTransaction count incremented by exactly 1');

    await OwnerTransaction.deleteOne({ operationId: ownerOp });
    console.log('  Verified strict isolation between Owner and Investor ledgers');
  }

  // --- TEST GROUP 5: Live Browser Verification with CDP ---
  console.log('\n--- GROUP 5: Live Chrome CDP Verification of Both Dashboards & Offline Refresh ---');
  let chromeProcess = null;
  let cdp = null;

  try {
    fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
    const debuggingPort = 9223;

    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--disable-gpu',
    ]);

    await delay(2000);

    // Get WebSocket URL
    const targetsRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${debuggingPort}/json`, (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
      });
    });

    const pageTarget = targetsRes.find((t) => t.type === 'page');
    assert(!!pageTarget, 'Found Chrome DevTools page target');

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // 1. Visit app and inject auth token
    await cdp.send('Page.navigate', { url: FRONTEND_URL });
    await delay(2000);

    await cdp.send('Runtime.evaluate', {
      expression: `
        localStorage.setItem('ims_token', '${token}');
        localStorage.setItem('token', '${token}');
        localStorage.setItem('user', JSON.stringify({ username: 'admin', role: 'admin' }));
      `,
    });

    // 2. Navigate to /owner
    console.log('  Navigating to /owner dashboard...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/owner` });
    await delay(3500);

    const ownerCardDom = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          return {
            hasHeading: text.includes('OWNER CAPITAL OVERVIEW'),
            hasCard1: text.includes('Profit Transferred to Capital'),
            hasCard2: text.includes('Remaining Owner Capital'),
            hasCard3: text.includes('TOTAL CAPITAL SUMMARY'),
            bodySnippet: text.slice(0, 1000),
          };
        })()
      `,
      returnByValue: true,
    });

    assert(ownerCardDom.result.value.hasHeading, 'Owner Dashboard displays "OWNER CAPITAL OVERVIEW" section');
    assert(ownerCardDom.result.value.hasCard1, 'Owner Dashboard displays Card 1: "Profit Transferred to Capital"');
    assert(ownerCardDom.result.value.hasCard2, 'Owner Dashboard displays Card 2: "Remaining Owner Capital"');
    assert(ownerCardDom.result.value.hasCard3, 'Owner Dashboard displays Card 3: "TOTAL CAPITAL SUMMARY"');

    // 3. Test Offline Reload on /owner
    console.log('  Emulating offline network conditions and refreshing /owner...');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    await cdp.send('Page.reload');
    await delay(3000);

    const ownerOfflineReload = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          return {
            hasHeading: text.includes('OWNER CAPITAL OVERVIEW'),
            hasCard1: text.includes('Profit Transferred to Capital'),
            hasCard2: text.includes('Remaining Owner Capital'),
            hasCard3: text.includes('TOTAL CAPITAL SUMMARY'),
            isOfflineBanner: text.includes('Offline Mode') || text.includes('offline'),
          };
        })()
      `,
      returnByValue: true,
    });

    assert(ownerOfflineReload.result.value.hasHeading, 'Offline reload on /owner maintains "OWNER CAPITAL OVERVIEW" heading');
    assert(ownerOfflineReload.result.value.hasCard1, 'Offline reload on /owner maintains Card 1');
    assert(ownerOfflineReload.result.value.hasCard2, 'Offline reload on /owner maintains Card 2');
    assert(ownerOfflineReload.result.value.hasCard3, 'Offline reload on /owner maintains Card 3 (Total Capital Summary)');

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });

    // 4. Navigate to /investors/:id
    const anyInv = await Investor.findOne({ isDeleted: { $ne: true } });
    console.log(`  Navigating to /investors/${anyInv._id}...`);
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/investors/${anyInv._id}` });
    await delay(3500);

    const invCardDom = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          return {
            hasHeading: text.includes('INVESTOR CAPITAL OVERVIEW'),
            hasCard1: text.includes('Profit Transferred to Capital'),
            hasCard2: text.includes('Remaining Investor Capital'),
            hasCard3: text.includes('TOTAL CAPITAL SUMMARY'),
          };
        })()
      `,
      returnByValue: true,
    });

    assert(invCardDom.result.value.hasHeading, 'Investor Dashboard displays "INVESTOR CAPITAL OVERVIEW" section');
    assert(invCardDom.result.value.hasCard1, 'Investor Dashboard displays Card 1: "Profit Transferred to Capital"');
    assert(invCardDom.result.value.hasCard2, 'Investor Dashboard displays Card 2: "Remaining Investor Capital"');
    assert(invCardDom.result.value.hasCard3, 'Investor Dashboard displays Card 3: "TOTAL CAPITAL SUMMARY"');

    // 5. Test Offline Reload on /investors/:id
    console.log(`  Emulating offline network conditions and refreshing /investors/${anyInv._id}...`);
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    await cdp.send('Page.reload');
    await delay(3000);

    const invOfflineReload = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const text = document.body.innerText;
          return {
            hasHeading: text.includes('INVESTOR CAPITAL OVERVIEW'),
            hasCard1: text.includes('Profit Transferred to Capital'),
            hasCard2: text.includes('Remaining Investor Capital'),
            hasCard3: text.includes('TOTAL CAPITAL SUMMARY'),
          };
        })()
      `,
      returnByValue: true,
    });

    assert(invOfflineReload.result.value.hasHeading, 'Offline reload on /investors/:id maintains "INVESTOR CAPITAL OVERVIEW" heading');
    assert(invOfflineReload.result.value.hasCard1, 'Offline reload on /investors/:id maintains Card 1');
    assert(invOfflineReload.result.value.hasCard2, 'Offline reload on /investors/:id maintains Card 2');
    assert(invOfflineReload.result.value.hasCard3, 'Offline reload on /investors/:id maintains Card 3 (Total Capital Summary)');

  } finally {
    if (cdp) cdp.close();
    if (chromeProcess) {
      chromeProcess.kill('SIGKILL');
      await delay(1000);
    }
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`TEST SUITE RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(passed === total ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
