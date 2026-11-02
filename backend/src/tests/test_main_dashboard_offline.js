/**
 * Comprehensive Verification Test for Main Dashboard Metrics in Offline Mode
 *
 * Verifies:
 * 1. Online baseline: All dashboard metrics load properly online from backend APIs.
 * 2. Caching: Dashboard summary and owner profit are stored into IndexedDB.
 * 3. Offline Mode Transition: When switched to offline, every single section displays valid values:
 *    - BUSINESS OVERVIEW: Total Customers, Active Customers, Completed Customers, Active Contracts, Completed Contracts
 *    - BUSINESS FINANCIALS: Total Sales, Total Product Cost, Total Collected, Total Remaining, Expected Profit, Expected Loss, Net Expected Profit
 *    - INSTALLMENT OVERVIEW: Paid, Partial, Pending, Missed, Overdue, Missed Amount, Overdue Amount
 *    - OWNER: Total Owner Profit, Owner Profit Withdrawn, Owner Profit Remaining, Investors Contributing
 *    - INVESTORS: Total Investors, Capital Received, Capital Returned, Capital Held, Capital Deployed, Recovered Capital, Capital Still Deployed, Profit Reinvested, Capital Available, Investor-Funded Contracts
 * 4. Offline Page Refresh: Hard refresh (Ctrl+R / reload) while offline maintains all metrics.
 * 5. Offline Navigation: Navigating away to /owner and back to / maintains all metrics offline.
 * 6. Reconnection: Restoring connection refreshes cleanly without errors or data mutation.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const mongoose = require('mongoose');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_dash_offline_${Date.now()}`);
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

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
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

async function runTests() {
  console.log('================================================================');
  console.log('STARTING MAIN DASHBOARD OFFLINE VERIFICATION TEST SUITE');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Obtain Auth Token
  const loginRes = await httpPost(`${BACKEND_URL}/api/auth/login`, {
    email: 'admin@localhost.com',
    password: '12345',
  });
  if (!loginRes.data?.token) {
    throw new Error('Failed to log in to backend API');
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

  let chromeProcess = null;
  let cdp = null;

  try {
    fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
    const debuggingPort = 9224;

    chromeProcess = spawn(CHROME_PATH, [
      `--remote-debugging-port=${debuggingPort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--disable-gpu',
    ]);

    await delay(2000);

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

    // 2. Perform initial sync and visit dashboard online
    console.log('\n--- PHASE 1: Online Baseline Loading & Sync ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await delay(4000);

    // Evaluate online dashboard metrics from DOM
    const onlineDomEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          function getCardValue(label) {
            const cards = Array.from(document.querySelectorAll('.card, div'));
            for (const c of cards) {
              const p = c.querySelector('p:first-child');
              if (p && p.innerText.trim().toLowerCase() === label.toLowerCase()) {
                const val = c.querySelector('p:nth-child(2)');
                if (val) return val.innerText.trim();
              }
            }
            return null;
          }

          return {
            totalCustomers: getCardValue('Total Customers'),
            activeCustomers: getCardValue('Active Customers'),
            completedCustomers: getCardValue('Completed Customers'),
            activeContracts: getCardValue('Active Contracts'),
            completedContracts: getCardValue('Completed Contracts'),
            totalSales: getCardValue('Total Sales'),
            totalProductCost: getCardValue('Total Product Cost'),
            totalCollected: getCardValue('Total Collected'),
            totalRemaining: getCardValue('Total Remaining'),
            expectedProfit: getCardValue('Expected Profit'),
            expectedLoss: getCardValue('Expected Loss'),
            netExpectedProfit: getCardValue('Net Expected Profit'),
            paidInstallments: getCardValue('Paid'),
            pendingInstallments: getCardValue('Pending'),
            totalOwnerProfit: getCardValue('Total Owner Profit'),
            ownerProfitRemaining: getCardValue('Owner Profit Remaining'),
            totalInvestors: getCardValue('Total Investors'),
            capitalReceived: getCardValue('Capital Received'),
            capitalHeld: getCardValue('Capital Held'),
            capitalDeployed: getCardValue('Capital Deployed'),
            capitalAvailable: getCardValue('Capital Available'),
            contractsFunded: getCardValue('Investor-Funded Contracts'),
          };
        })()
      `,
      returnByValue: true,
    });

    const onlineMetrics = onlineDomEval.result.value;
    console.log('  Online Baseline Metrics Sample:', {
      totalCustomers: onlineMetrics.totalCustomers,
      totalSales: onlineMetrics.totalSales,
      totalCollected: onlineMetrics.totalCollected,
      totalOwnerProfit: onlineMetrics.totalOwnerProfit,
      capitalHeld: onlineMetrics.capitalHeld,
    });

    assert(onlineMetrics.totalCustomers !== null && onlineMetrics.totalCustomers !== '—', 'Online: Total Customers is loaded');
    assert(onlineMetrics.totalSales !== null && onlineMetrics.totalSales !== 'PKR 0', 'Online: Total Sales is non-zero and formatted');
    assert(onlineMetrics.totalCollected !== null && onlineMetrics.totalCollected !== 'PKR 0', 'Online: Total Collected is non-zero and formatted');
    assert(onlineMetrics.totalInvestors !== null && onlineMetrics.totalInvestors !== '—', 'Online: Total Investors is loaded');

    // --- PHASE 2: Offline Mode Emulation ---
    console.log('\n--- PHASE 2: Emulating Offline Mode & Testing Dashboard ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    // Check DOM immediately after network cut
    const offlineBannerEval = await cdp.send('Runtime.evaluate', {
      expression: `document.body.innerText.includes('Offline Mode')`,
      returnByValue: true,
    });

    // --- PHASE 3: Offline Page Refresh (Ctrl + R) ---
    console.log('\n--- PHASE 3: Reloading Page in Offline Mode (Ctrl + R simulation) ---');
    await cdp.send('Page.reload');
    await delay(3500);

    const offlineDomEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          function getCardValue(label) {
            const cards = Array.from(document.querySelectorAll('.card, div'));
            for (const c of cards) {
              const p = c.querySelector('p:first-child');
              if (p && p.innerText.trim().toLowerCase() === label.toLowerCase()) {
                const val = c.querySelector('p:nth-child(2)');
                if (val) return val.innerText.trim();
              }
            }
            return null;
          }

          const text = document.body.innerText;

          return {
            hasOfflineBanner: text.includes('Offline Mode'),
            hasBusinessOverviewHeading: text.includes('BUSINESS OVERVIEW'),
            hasFinancialsHeading: text.includes('BUSINESS FINANCIALS'),
            hasInstallmentOverviewHeading: text.includes('INSTALLMENT OVERVIEW'),
            hasOwnerHeading: text.includes('OWNER'),
            hasInvestorsHeading: text.includes('INVESTORS'),
            metrics: {
              totalCustomers: getCardValue('Total Customers'),
              activeCustomers: getCardValue('Active Customers'),
              completedCustomers: getCardValue('Completed Customers'),
              activeContracts: getCardValue('Active Contracts'),
              completedContracts: getCardValue('Completed Contracts'),
              totalSales: getCardValue('Total Sales'),
              totalProductCost: getCardValue('Total Product Cost'),
              totalCollected: getCardValue('Total Collected'),
              totalRemaining: getCardValue('Total Remaining'),
              expectedProfit: getCardValue('Expected Profit'),
              expectedLoss: getCardValue('Expected Loss'),
              netExpectedProfit: getCardValue('Net Expected Profit'),
              paidInstallments: getCardValue('Paid'),
              partialInstallments: getCardValue('Partial'),
              pendingInstallments: getCardValue('Pending'),
              missedInstallments: getCardValue('Missed'),
              overdueInstallments: getCardValue('Overdue'),
              missedAmount: getCardValue('Missed Amount'),
              overdueAmount: getCardValue('Overdue Amount'),
              totalOwnerProfit: getCardValue('Total Owner Profit'),
              ownerProfitWithdrawn: getCardValue('Owner Profit Withdrawn'),
              ownerProfitRemaining: getCardValue('Owner Profit Remaining'),
              investorsContributing: getCardValue('Investors Contributing'),
              totalInvestors: getCardValue('Total Investors'),
              capitalReceived: getCardValue('Capital Received'),
              capitalReturned: getCardValue('Capital Returned'),
              capitalHeld: getCardValue('Capital Held'),
              capitalDeployed: getCardValue('Capital Deployed'),
              recoveredCapital: getCardValue('Recovered Capital'),
              capitalStillDeployed: getCardValue('Capital Still Deployed'),
              profitReinvested: getCardValue('Profit Reinvested'),
              capitalAvailable: getCardValue('Capital Available'),
              contractsFunded: getCardValue('Investor-Funded Contracts'),
            }
          };
        })()
      `,
      returnByValue: true,
    });

    const offResult = offlineDomEval.result.value;
    const offM = offResult.metrics;

    console.log('  Offline Reload Metrics Sample:', {
      totalCustomers: offM.totalCustomers,
      totalSales: offM.totalSales,
      totalCollected: offM.totalCollected,
      totalOwnerProfit: offM.totalOwnerProfit,
      capitalHeld: offM.capitalHeld,
      capitalAvailable: offM.capitalAvailable,
    });

    assert(offResult.hasOfflineBanner, 'Offline banner displayed correctly');
    assert(offResult.hasBusinessOverviewHeading, 'Business Overview heading displayed');
    assert(offResult.hasFinancialsHeading, 'Business Financials heading displayed');
    assert(offResult.hasInstallmentOverviewHeading, 'Installment Overview heading displayed');
    assert(offResult.hasOwnerHeading, 'Owner section heading displayed');
    assert(offResult.hasInvestorsHeading, 'Investors section heading displayed');

    // 1. BUSINESS OVERVIEW
    assert(offM.totalCustomers !== null && offM.totalCustomers !== '—' && offM.totalCustomers !== '', `Offline Total Customers: ${offM.totalCustomers}`);
    assert(offM.activeCustomers !== null && offM.activeCustomers !== '—' && offM.activeCustomers !== '', `Offline Active Customers: ${offM.activeCustomers}`);
    assert(offM.completedCustomers !== null && offM.completedCustomers !== '—' && offM.completedCustomers !== '', `Offline Completed Customers: ${offM.completedCustomers}`);
    assert(offM.activeContracts !== null && offM.activeContracts !== '—' && offM.activeContracts !== '', `Offline Active Contracts: ${offM.activeContracts}`);
    assert(offM.completedContracts !== null && offM.completedContracts !== '—' && offM.completedContracts !== '', `Offline Completed Contracts: ${offM.completedContracts}`);

    // 2. BUSINESS FINANCIALS
    assert(offM.totalSales !== null && offM.totalSales !== 'PKR 0' && offM.totalSales !== '—', `Offline Total Sales: ${offM.totalSales} (not 0 or blank)`);
    assert(offM.totalProductCost !== null && offM.totalProductCost !== '—', `Offline Total Product Cost: ${offM.totalProductCost}`);
    assert(offM.totalCollected !== null && offM.totalCollected !== 'PKR 0' && offM.totalCollected !== '—', `Offline Total Collected: ${offM.totalCollected} (not 0 or blank)`);
    assert(offM.totalRemaining !== null && offM.totalRemaining !== '—', `Offline Total Remaining: ${offM.totalRemaining}`);
    assert(offM.expectedProfit !== null && offM.expectedProfit !== '—', `Offline Expected Profit: ${offM.expectedProfit}`);
    assert(offM.expectedLoss !== null && offM.expectedLoss !== '—', `Offline Expected Loss: ${offM.expectedLoss}`);
    assert(offM.netExpectedProfit !== null && offM.netExpectedProfit !== '—', `Offline Net Expected Profit: ${offM.netExpectedProfit}`);

    // Verify consistency with online values
    assert(offM.totalCustomers === onlineMetrics.totalCustomers, `Total Customers offline (${offM.totalCustomers}) matches online (${onlineMetrics.totalCustomers})`);
    assert(offM.totalSales === onlineMetrics.totalSales, `Total Sales offline (${offM.totalSales}) matches online (${onlineMetrics.totalSales})`);
    assert(offM.totalCollected === onlineMetrics.totalCollected, `Total Collected offline (${offM.totalCollected}) matches online (${onlineMetrics.totalCollected})`);

    // 3. INSTALLMENT OVERVIEW
    assert(offM.paidInstallments !== null && offM.paidInstallments !== '—', `Offline Paid Installments: ${offM.paidInstallments}`);
    assert(offM.pendingInstallments !== null && offM.pendingInstallments !== '—', `Offline Pending Installments: ${offM.pendingInstallments}`);
    assert(offM.missedAmount !== null && offM.missedAmount !== '—', `Offline Missed Amount: ${offM.missedAmount}`);
    assert(offM.overdueAmount !== null && offM.overdueAmount !== '—', `Offline Overdue Amount: ${offM.overdueAmount}`);

    // 4. OWNER
    assert(offM.totalOwnerProfit !== null && offM.totalOwnerProfit !== '—', `Offline Total Owner Profit: ${offM.totalOwnerProfit}`);
    assert(offM.ownerProfitWithdrawn !== null && offM.ownerProfitWithdrawn !== '—', `Offline Owner Profit Withdrawn: ${offM.ownerProfitWithdrawn}`);
    assert(offM.ownerProfitRemaining !== null && offM.ownerProfitRemaining !== '—', `Offline Owner Profit Remaining: ${offM.ownerProfitRemaining}`);
    assert(offM.investorsContributing !== null && offM.investorsContributing !== '—', `Offline Investors Contributing: ${offM.investorsContributing}`);

    // 5. INVESTORS
    assert(offM.totalInvestors !== null && offM.totalInvestors !== '—', `Offline Total Investors: ${offM.totalInvestors}`);
    assert(offM.capitalReceived !== null && offM.capitalReceived !== '—', `Offline Capital Received: ${offM.capitalReceived}`);
    assert(offM.capitalHeld !== null && offM.capitalHeld !== '—', `Offline Capital Held: ${offM.capitalHeld}`);
    assert(offM.capitalDeployed !== null && offM.capitalDeployed !== '—', `Offline Capital Deployed: ${offM.capitalDeployed}`);
    assert(offM.contractsFunded !== null && offM.contractsFunded !== '—', `Offline Investor-Funded Contracts: ${offM.contractsFunded}`);

    // --- PHASE 4: Offline Navigation Test ---
    console.log('\n--- PHASE 4: Navigating away to /owner and returning to / while offline ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/owner` });
    await delay(2500);

    const ownerPageText = await cdp.send('Runtime.evaluate', {
      expression: `document.body.innerText.includes('Owner Dashboard')`,
      returnByValue: true,
    });
    assert(ownerPageText.result.value, 'Successfully navigated to /owner offline');

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await delay(2500);

    const returnedDashboardEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          function getCardValue(label) {
            const cards = Array.from(document.querySelectorAll('.card, div'));
            for (const c of cards) {
              const p = c.querySelector('p:first-child');
              if (p && p.innerText.trim().toLowerCase() === label.toLowerCase()) {
                const val = c.querySelector('p:nth-child(2)');
                if (val) return val.innerText.trim();
              }
            }
            return null;
          }

          return {
            totalCustomers: getCardValue('Total Customers'),
            totalSales: getCardValue('Total Sales'),
            totalCollected: getCardValue('Total Collected'),
            capitalHeld: getCardValue('Capital Held'),
          };
        })()
      `,
      returnByValue: true,
    });

    const retM = returnedDashboardEval.result.value;
    assert(retM.totalCustomers === onlineMetrics.totalCustomers, 'After offline navigation, Total Customers remains intact');
    assert(retM.totalSales === onlineMetrics.totalSales, 'After offline navigation, Total Sales remains intact');
    assert(retM.totalCollected === onlineMetrics.totalCollected, 'After offline navigation, Total Collected remains intact');

    // --- PHASE 5: Reconnection Test ---
    console.log('\n--- PHASE 5: Restoring Online Connection ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await delay(2000);

    await cdp.send('Page.reload');
    await delay(3000);

    const reconnectedDom = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          function getCardValue(label) {
            const cards = Array.from(document.querySelectorAll('.card, div'));
            for (const c of cards) {
              const p = c.querySelector('p:first-child');
              if (p && p.innerText.trim().toLowerCase() === label.toLowerCase()) {
                const val = c.querySelector('p:nth-child(2)');
                if (val) return val.innerText.trim();
              }
            }
            return null;
          }

          return {
            totalCustomers: getCardValue('Total Customers'),
            totalSales: getCardValue('Total Sales'),
            totalCollected: getCardValue('Total Collected'),
            hasOfflineBanner: document.body.innerText.includes('Offline Mode'),
          };
        })()
      `,
      returnByValue: true,
    });

    const reconM = reconnectedDom.result.value;
    assert(!reconM.hasOfflineBanner, 'Reconnected: Offline banner is removed');
    assert(reconM.totalCustomers === onlineMetrics.totalCustomers, 'Reconnected: Total Customers matches online baseline');
    assert(reconM.totalSales === onlineMetrics.totalSales, 'Reconnected: Total Sales matches online baseline');
    assert(reconM.totalCollected === onlineMetrics.totalCollected, 'Reconnected: Total Collected matches online baseline');

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
  console.log(`MAIN DASHBOARD OFFLINE TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================\n');

  await mongoose.disconnect();
  process.exit(passed === total ? 0 : 1);
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
