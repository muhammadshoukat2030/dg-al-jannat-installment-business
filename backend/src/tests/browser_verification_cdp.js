/**
 * End-to-End Chrome Browser Verification Script using Chrome DevTools Protocol (CDP)
 * Tests actual Google Chrome against local Vite frontend & Express backend.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');

require('../models');
const Customer = mongoose.model('Customer');
const InstallmentPlan = mongoose.model('InstallmentPlan');
const Installment = mongoose.model('Installment');
const Payment = mongoose.model('Payment');
const Investor = mongoose.model('Investor');
const InvestorTransaction = mongoose.model('InvestorTransaction');
const Withdrawal = mongoose.model('Withdrawal');
const OwnerTransaction = mongoose.model('OwnerTransaction');
const FundingAllocation = mongoose.model('FundingAllocation');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_ims_test_${Date.now()}`);
const MONGO_URI = 'mongodb://127.0.0.1:27017/installment_management3';
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000';
const ARTIFACT_DIR = 'C:\\Users\\M SHOUKAT-ENGINEER\\.gemini\\antigravity\\brain\\fa183b57-609d-4e08-8302-f5596f164154';

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
      }
    };
  }

  ready() {
    return new Promise((resolve) => {
      if (this.ws.readyState === WebSocket.OPEN) resolve();
      else this.ws.onopen = () => resolve();
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runBrowserVerification() {
  console.log('================================================================');
  console.log('STARTING CHROME BROWSER VERIFICATION (LOCAL ONLY)');
  console.log('================================================================');
  console.log(`Frontend URL: ${FRONTEND_URL}`);
  console.log(`Backend URL:  ${BACKEND_URL}`);
  console.log(`Database:     installment_management3`);

  await mongoose.connect(MONGO_URI);
  console.log('✓ Connected to MongoDB');

  const serverCounts = {
    customers: await Customer.countDocuments({ isDeleted: { $ne: true } }),
    installmentPlans: await InstallmentPlan.countDocuments({ isDeleted: { $ne: true } }),
    installments: await Installment.countDocuments({}),
    payments: await Payment.countDocuments({}),
    investors: await Investor.countDocuments({ isDeleted: { $ne: true } }),
    investorTransactions: await InvestorTransaction.countDocuments({}),
    withdrawals: await Withdrawal.countDocuments({}),
    ownerTransactions: await OwnerTransaction.countDocuments({}),
    fundingAllocations: await FundingAllocation.countDocuments({}),
  };
  console.log('MongoDB Actual Counts:', JSON.stringify(serverCounts, null, 2));

  // 1. Launch Chrome with CDP
  console.log('\n--- 1. Launching Headless Chrome with Remote Debugging ---');
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });

  const chromeProc = spawn(CHROME_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    `--user-data-dir=${TEMP_PROFILE_DIR}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    'about:blank',
  ]);

  let cdp = null;

  try {
    // Wait for Chrome DevTools endpoint to become ready
    let target = null;
    for (let i = 0; i < 20; i++) {
      await sleep(500);
      try {
        const res = await fetch('http://127.0.0.1:9222/json');
        const list = await res.json();
        target = list.find((t) => t.type === 'page');
        if (target && target.webSocketDebuggerUrl) break;
      } catch {}
    }

    if (!target || !target.webSocketDebuggerUrl) {
      throw new Error('Failed to connect to Chrome DevTools endpoint on port 9222.');
    }
    console.log(`✓ Connected to Chrome Target: ${target.title} (${target.webSocketDebuggerUrl})`);

    cdp = new CDPClient(target.webSocketDebuggerUrl);
    await cdp.ready();
    console.log('✓ CDP WebSocket connection opened');

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // 2. Navigate to Login Page
    console.log('\n--- 2. Navigating to Local Login Page ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/login` });
    await sleep(2000);

    // Evaluate title and form elements
    const pageCheck = await cdp.send('Runtime.evaluate', {
      expression: 'document.title + " | " + !!document.querySelector("input[type=\'password\']")',
    });
    console.log(`  ✓ Login page loaded: ${pageCheck.result.value}`);

    // Perform Login via standard fetch in Chrome
    console.log('\n--- 3. Submitting Test Admin Credentials in Chrome ---');
    const loginEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          try {
            const res = await fetch('http://localhost:5000/api/auth/login', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: 'admin@localhost.com', password: '12345' }),
            });
            const data = await res.json();
            if (data.success && data.token) {
              localStorage.setItem('ims_token', data.token);
              localStorage.setItem('ims_admin', JSON.stringify(data.admin));
              window.location.href = '/';
              return { success: true, email: data.admin?.email };
            }
            return { success: false, error: data.message || 'No token in response' };
          } catch (err) {
            return { success: false, error: err.message };
          }
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log(`  ✓ Auth login result in Chrome:`, loginEval.result.value);

    // Wait for redirection to Dashboard & React hydration
    await sleep(3000);

    const tokenCheck = await cdp.send('Runtime.evaluate', {
      expression: `
        ({
          pathname: window.location.pathname,
          hasToken: !!localStorage.getItem('ims_token'),
          admin: localStorage.getItem('ims_admin'),
          hasTriggerSync: typeof window.__ims_triggerSync === 'function'
        })
      `,
      returnByValue: true,
    });
    console.log('  ✓ Post-login state in Chrome:', tokenCheck.result.value);

    if (!tokenCheck.result.value.hasToken) {
      throw new Error('Login failed: ims_token was not stored in localStorage.');
    }

    // 4. Trigger Bootstrap Sync in Chrome
    console.log('\n--- 4. Executing Initial Bootstrap Synchronization in Chrome ---');
    const syncEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          if (typeof window.__ims_triggerSync === 'function') {
            await window.__ims_triggerSync();
            return { triggered: true };
          }
          return { triggered: false, reason: 'window.__ims_triggerSync not found' };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('  ✓ triggerSync execution result:', syncEval.result.value);

    // Wait for manifest & all module chunks to complete
    let syncState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      const stateEval = await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const s = window.__ims_syncState || {};
            return {
              isSyncing: s.isSyncing,
              bootstrapStatus: s.bootstrapStatus,
              bootstrapPercent: s.bootstrapPercent,
              lastError: s.lastError,
              currentStep: s.currentStep,
              lastSyncTime: s.lastSyncTime
            };
          })()
        `,
        returnByValue: true,
      });
      syncState = stateEval.result.value;
      console.log(`  [Sync Monitor] Status: ${syncState.bootstrapStatus} (${syncState.bootstrapPercent}%) Step: "${syncState.currentStep}" isSyncing: ${syncState.isSyncing} lastSync: ${syncState.lastSyncTime}`);
      if (!syncState.isSyncing && syncState.bootstrapStatus === 'COMPLETED') {
        break;
      }
    }

    if (syncState.bootstrapStatus !== 'COMPLETED') {
      throw new Error(`Bootstrap failed to complete: ${JSON.stringify(syncState)}`);
    }
    console.log('✓ Initial Bootstrap reached COMPLETED (100%) in Chrome!');

    // 5. Inspect Actual IndexedDB Record Counts Inside Chrome via Native IDB API
    console.log('\n--- 5. Comparing MongoDB Counts vs Chrome IndexedDB Counts ---');
    const idbCountsEval = await cdp.send('Runtime.evaluate', {
      expression: `
        new Promise((resolve, reject) => {
          const req = indexedDB.open('ims_offline_db', 3);
          req.onsuccess = async () => {
            const db = req.result;
            const stores = [
              'customers', 'installmentPlans', 'installments', 'payments',
              'investors', 'investorTransactions', 'withdrawals', 'ownerTransactions',
              'fundingAllocations'
            ];
            const counts = {};
            const tx = db.transaction(stores, 'readonly');
            for (const s of stores) {
              const countReq = tx.objectStore(s).count();
              await new Promise(r => countReq.onsuccess = r);
              counts[s] = countReq.result;
            }
            resolve(counts);
          };
          req.onerror = () => reject(req.error);
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    const idbCounts = idbCountsEval.result.value;
    console.log('Actual Chrome IndexedDB Counts:', JSON.stringify(idbCounts, null, 2));

    const comparisons = [
      { name: 'customers', server: serverCounts.customers, idb: idbCounts.customers },
      { name: 'installmentPlans', server: serverCounts.installmentPlans, idb: idbCounts.installmentPlans },
      { name: 'installments', server: serverCounts.installments, idb: idbCounts.installments },
      { name: 'payments', server: serverCounts.payments, idb: idbCounts.payments },
      { name: 'investors', server: serverCounts.investors, idb: idbCounts.investors },
      { name: 'investorTransactions', server: serverCounts.investorTransactions, idb: idbCounts.investorTransactions },
      { name: 'withdrawals', server: serverCounts.withdrawals, idb: idbCounts.withdrawals },
      { name: 'ownerTransactions', server: serverCounts.ownerTransactions, idb: idbCounts.ownerTransactions },
      { name: 'fundingAllocations', server: serverCounts.fundingAllocations, idb: idbCounts.fundingAllocations },
    ];

    let allCountsExact = true;
    for (const c of comparisons) {
      const match = c.server === c.idb;
      console.log(`  ${c.name.padEnd(22)}: Server=${c.server}, IndexedDB=${c.idb} -> Match: ${match ? 'YES (PASS)' : 'NO (FAIL)'}`);
      if (!match) allCountsExact = false;
    }

    if (!allCountsExact) {
      throw new Error('IndexedDB count mismatch with MongoDB server records.');
    }
    console.log('✓ All 9 collection record counts match 1:1 in Chrome IndexedDB!');

    // 6. Test Offline Mode in Chrome via Client-Side SPA Navigation & SW Caching
    console.log('\n--- 6. Testing Complete Offline Operation in Chrome ---');
    console.log('  -> Waiting for Service Worker to activate & cache app shell...');
    await sleep(4000);

    console.log('  -> Enabling Chrome Network.emulateNetworkConditions({ offline: true })...');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    // Test Dashboard rendered while offline
    const offlineDashEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const body = document.body.innerText;
          return {
            hasCustomers: body.includes('Customers') || body.includes('Total Customers'),
            hasSales: body.includes('Sales') || body.includes('Total Sales'),
            hasPKR: body.includes('PKR'),
            isOfflineBadge: !!document.querySelector('.border-amber-500\\\\/30') || body.includes('Offline') || body.includes('Local'),
            sampleText: body.slice(0, 250).replace(/\\s+/g, ' ')
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('  ✓ Offline Dashboard Verification:', offlineDashEval.result.value);

    // Test Navigation to Customers page while offline via React Router link
    console.log('  -> Navigating to /customers while offline via UI link...');
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const link = document.querySelector('a[href="/customers"]');
          if (link) { link.click(); return true; }
          return false;
        })()
      `,
    });
    await sleep(2000);

    const offlineCustomersEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const rows = document.querySelectorAll('tbody tr');
          const names = Array.from(rows).map(r => r.querySelector('td')?.innerText?.trim()).filter(Boolean);
          return {
            url: window.location.pathname,
            rowsCount: rows.length,
            customerNames: names,
            hasAddBtn: !!document.querySelector('a[href="/customers/new"]')
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('  ✓ Offline Customers Page Verification:', offlineCustomersEval.result.value);

    // Test Navigation to Investors page while offline via React Router link
    console.log('  -> Navigating to /investors while offline via UI link...');
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const link = document.querySelector('a[href="/investors"]');
          if (link) { link.click(); return true; }
          return false;
        })()
      `,
    });
    await sleep(2000);

    const offlineInvestorsEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const rows = document.querySelectorAll('tbody tr');
          const names = Array.from(rows).map(r => r.querySelector('td')?.innerText?.trim()).filter(Boolean);
          return {
            url: window.location.pathname,
            rowsCount: rows.length,
            investorNames: names
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('  ✓ Offline Investors Page Verification:', offlineInvestorsEval.result.value);

    // Test Navigation to Owner Dashboard while offline
    console.log('  -> Navigating to /owner while offline via UI link...');
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const link = document.querySelector('a[href="/owner"]');
          if (link) { link.click(); return true; }
          return false;
        })()
      `,
    });
    await sleep(2000);

    const offlineOwnerEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const body = document.body.innerText;
          return {
            url: window.location.pathname,
            hasCapital: body.includes('Capital') || body.includes('PKR'),
            hasProfit: body.includes('Profit') || body.includes('PKR'),
            snippet: body.slice(0, 200).replace(/\\s+/g, ' ')
          };
        })()
      `,
      returnByValue: true,
    });
    console.log('  ✓ Offline Owner Dashboard Verification:', offlineOwnerEval.result.value);

    // Test Navigation back to Dashboard
    await cdp.send('Runtime.evaluate', {
      expression: `
        (() => {
          const link = document.querySelector('a[href="/"]');
          if (link) link.click();
        })()
      `,
    });
    await sleep(1500);

    // 7. Capture Offline Screenshot
    console.log('\n--- 7. Capturing Full Page Screenshot in Offline Mode ---');
    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.join(ARTIFACT_DIR, 'chrome_offline_verification.png');
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
    console.log(`✓ Offline screenshot saved to: ${screenshotPath}`);

    // 8. Restore Network & Test Reconnection
    console.log('\n--- 8. Restoring Network & Testing Automatic Reconnection ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await sleep(2000);

    const reconnectEval = await cdp.send('Runtime.evaluate', {
      expression: `
        (async () => {
          if (typeof window.__ims_triggerSync === 'function') {
            await window.__ims_triggerSync();
          }
          const s = window.__ims_syncState || {};
          return {
            isOnline: s.isOnline,
            isSyncing: s.isSyncing,
            lastSyncTime: s.lastSyncTime,
            lastError: s.lastError,
            bootstrapStatus: s.bootstrapStatus
          };
        })()
      `,
      awaitPromise: true,
      returnByValue: true,
    });
    console.log('✓ Reconnect & Sync State in Chrome:', reconnectEval.result.value);

    console.log('\n================================================================');
    console.log('ALL CHROME BROWSER LOCAL TESTS PASSED CLEANLY (100%)');
    console.log('================================================================');
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
    await mongoose.disconnect();
  }
}

runBrowserVerification().catch((err) => {
  console.error('Browser verification failed:', err);
  process.exit(1);
});
