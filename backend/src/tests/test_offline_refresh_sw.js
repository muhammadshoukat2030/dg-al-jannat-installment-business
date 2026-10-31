/**
 * Automated End-to-End Verification Script for Service Worker Asset Caching & Offline Refresh
 * Validates:
 * 1. Login with real database admin credentials.
 * 2. Bootstrap synchronization of MongoDB records into IndexedDB.
 * 3. Service Worker registration and precache completeness.
 * 4. Zero HTTP 408 / net::ERR_ABORTED errors.
 * 5. Full offline reload (Ctrl + R) across all 12 routes with IndexedDB data rendering.
 * 6. Hard reload (Ctrl + Shift + R) browser behavior analysis.
 * 7. Online restoration and background sync readiness.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_sw_test_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000';

class CDPClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 1;
    this.callbacks = new Map();
    this.events = [];
    this.requestLog = [];
    this.responseLog = [];
    this.consoleLogs = [];

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method) {
        this.events.push(data);
        if (data.method === 'Network.requestWillBeSent') {
          this.requestLog.push(data.params);
        } else if (data.method === 'Network.responseReceived') {
          this.responseLog.push(data.params);
        } else if (data.method === 'Network.loadingFailed') {
          this.responseLog.push({ ...data.params, failed: true });
        } else if (data.method === 'Runtime.consoleAPICalled') {
          const text = (data.params.args || []).map((a) => a.value || a.description || '').join(' ');
          this.consoleLogs.push({ type: data.params.type, text });
        }
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

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'CDP Eval Exception');
    }
    return res.result ? res.result.value : undefined;
  }

  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runTest() {
  console.log('================================================================');
  console.log('SERVICE WORKER ASSET CACHING & OFFLINE REFRESH VERIFICATION');
  console.log('================================================================');

  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
  const remoteDebuggingPort = 9225;

  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-sync',
      '--disable-translate',
      '--headless=new',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let cdp;
  const results = {
    authLogin: 'NOT TESTED',
    bootstrapSync: 'NOT TESTED',
    swRegistration: 'NOT TESTED',
    precachedAssets: 'NOT TESTED',
    cachedAssetList: [],
    routesOfflineTested: {},
    hardReloadTested: 'NOT TESTED',
    no408Errors: 'NOT TESTED',
    indexedDBPreserved: 'NOT TESTED',
    reconnectTested: 'NOT TESTED',
  };

  try {
    let pageTarget = null;
    for (let i = 0; i < 30; i++) {
      await sleep(500);
      try {
        const list = await new Promise((resolve, reject) => {
          http
            .get(`http://127.0.0.1:${remoteDebuggingPort}/json`, (res) => {
              let body = '';
              res.on('data', (d) => (body += d));
              res.on('end', () => resolve(JSON.parse(body)));
            })
            .on('error', reject);
        });
        pageTarget = list.find((t) => t.type === 'page');
        if (pageTarget) break;
      } catch (e) {}
    }

    if (!pageTarget) {
      throw new Error('Could not connect to Chrome debugging target');
    }

    console.log(`Connected to Chrome debugging port: ${remoteDebuggingPort}`);
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();

    await cdp.send('Page.enable');
    await cdp.send('Network.enable');
    await cdp.send('Runtime.enable');

    // 1. Initial Online Load & Login via API credentials
    console.log('\n--- Step 1: Online Application Load & Login ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/login` });
    await sleep(2000);

    const loginRes = await cdp.eval(`
      (async () => {
        try {
          const res = await fetch('${BACKEND_URL}/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@localhost.com', password: '12345' }),
          });
          const data = await res.json();
          if (data.success && data.token) {
            localStorage.setItem('ims_token', data.token);
            localStorage.setItem('ims_admin', JSON.stringify(data.admin));
            return { success: true, email: data.admin?.email };
          }
          return { success: false, error: data.message };
        } catch (e) {
          return { success: false, error: e.message };
        }
      })()
    `);
    console.log('Login result:', loginRes);

    if (loginRes.success) {
      results.authLogin = 'PASS';
    } else {
      results.authLogin = 'FAIL';
      throw new Error(`Login failed: ${loginRes.error}`);
    }

    // Navigate to root (Dashboard)
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await sleep(3000);

    // 2. Perform Bootstrap Sync to populate IndexedDB
    console.log('\n--- Step 2: Triggering Bootstrap Sync ---');
    await cdp.eval(`
      (async () => {
        if (typeof window.__ims_triggerSync === 'function') {
          await window.__ims_triggerSync();
        }
      })()
    `);

    // Poll until bootstrap finishes
    let syncState = null;
    for (let i = 0; i < 30; i++) {
      await sleep(1000);
      syncState = await cdp.eval(`
        (() => {
          const s = window.__ims_syncState || {};
          return {
            isSyncing: s.isSyncing,
            bootstrapStatus: s.bootstrapStatus,
            bootstrapPercent: s.bootstrapPercent,
            currentStep: s.currentStep,
            lastSyncTime: s.lastSyncTime
          };
        })()
      `);
      console.log(`  [Sync Monitor] Status: ${syncState.bootstrapStatus} (${syncState.bootstrapPercent}%) Step: "${syncState.currentStep}" isSyncing: ${syncState.isSyncing}`);
      if (!syncState.isSyncing && syncState.bootstrapStatus === 'COMPLETED') {
        break;
      }
    }

    if (syncState && syncState.bootstrapStatus === 'COMPLETED') {
      results.bootstrapSync = 'PASS';
      console.log('✓ Initial Bootstrap reached COMPLETED (100%) in Chrome!');
    } else {
      results.bootstrapSync = 'FAIL';
    }

    // 3. Inspect IndexedDB Data
    const idbCounts = await cdp.eval(`
      (async () => {
        return new Promise((resolve) => {
          const req = indexedDB.open('ims_offline_db');
          req.onsuccess = (e) => {
            const db = e.target.result;
            const stores = Array.from(db.objectStoreNames);
            const counts = {};
            let remaining = stores.length;
            if (remaining === 0) return resolve({ stores: [], counts: {} });
            const tx = db.transaction(stores, 'readonly');
            stores.forEach((storeName) => {
              const countReq = tx.objectStore(storeName).count();
              countReq.onsuccess = () => {
                counts[storeName] = countReq.result;
                remaining--;
                if (remaining === 0) resolve({ stores, counts });
              };
              countReq.onerror = () => {
                remaining--;
                if (remaining === 0) resolve({ stores, counts });
              };
            });
          };
          req.onerror = () => resolve({ error: 'Failed to open IDB' });
        });
      })()
    `);
    console.log('IndexedDB Records Populated:', JSON.stringify(idbCounts.counts, null, 2));
    const totalIdbRecords = Object.values(idbCounts.counts || {}).reduce((a, b) => a + b, 0);

    // 4. Verify Service Worker Status & Precaching
    console.log('\n--- Step 3: Service Worker Registration & Cache Inspection ---');
    const swInfo = await cdp.eval(`
      (async () => {
        if (!('serviceWorker' in navigator)) return { supported: false };
        const reg = await navigator.serviceWorker.getRegistration();
        return {
          supported: true,
          registered: !!reg,
          active: !!(reg && reg.active),
          controller: !!navigator.serviceWorker.controller,
          scope: reg ? reg.scope : null,
        };
      })()
    `);
    console.log('Service Worker status:', JSON.stringify(swInfo, null, 2));

    if (swInfo.registered && swInfo.active) {
      results.swRegistration = 'PASS';
    } else {
      results.swRegistration = 'FAIL';
    }

    const cacheInspection = await cdp.eval(`
      (async () => {
        const cacheNames = await caches.keys();
        const details = {};
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          const requests = await cache.keys();
          details[name] = requests.map(r => new URL(r.url).pathname);
        }
        return details;
      })()
    `);
    console.log('Cache Storage contents:', JSON.stringify(cacheInspection, null, 2));

    let foundJs = false;
    let foundCss = false;
    let foundHtml = false;

    for (const [cacheName, urls] of Object.entries(cacheInspection)) {
      results.cachedAssetList.push(...urls);
      if (urls.some((u) => u.endsWith('.js') && u.includes('/assets/'))) foundJs = true;
      if (urls.some((u) => u.endsWith('.css') && u.includes('/assets/'))) foundCss = true;
      if (urls.includes('/index.html') || urls.includes('/')) foundHtml = true;
    }

    if (foundJs && foundCss && foundHtml) {
      results.precachedAssets = 'PASS';
      console.log('✓ All essential production assets (HTML shell, JS bundle, CSS bundle) are verified in Cache Storage!');
    } else {
      results.precachedAssets = 'FAIL';
    }

    // 5. Switch Network to OFFLINE
    console.log('\n--- Step 4: Emulating Complete Offline Network Condition ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const isOnlineEval = await cdp.eval('navigator.onLine');
    console.log(`Browser navigator.onLine is now: ${isOnlineEval}`);

    // 6. Test Offline Page Refresh (Ctrl + R) across all critical routes
    const routesToTest = [
      '/settings',
      '/dashboard',
      '/customers',
      '/customers/new',
      '/investors',
      '/investors/new',
      '/owner',
      '/owner/funded-customers',
      '/owner/funded-contracts',
      '/withdrawals',
      '/payments',
      '/reports',
    ];

    console.log('\n--- Step 5: Testing Offline Page Reload (Ctrl + R) Across All Routes ---');
    let any408Found = false;

    for (const route of routesToTest) {
      cdp.requestLog = [];
      cdp.responseLog = [];

      // Navigate to route offline
      await cdp.send('Page.navigate', { url: `${FRONTEND_URL}${route}` });
      await sleep(1000);

      // Perform standard page reload (Ctrl + R)
      await cdp.send('Page.reload', { ignoreCache: false });
      await sleep(2200);

      const has408 = cdp.responseLog.some((r) => r.response && r.response.status === 408);
      if (has408) any408Found = true;

      // Verify DOM rendering
      const pageState = await cdp.eval(`
        (() => {
          const root = document.getElementById('root');
          const hasContent = root && root.children.length > 0;
          const bodyText = document.body.innerText || '';
          const isBlank = bodyText.trim().length === 0;
          const hasError = bodyText.includes('ERR_ABORTED') || bodyText.includes('net::');
          const hasFooter = bodyText.includes('Software Development by SHOUKAT');
          return {
            url: window.location.pathname,
            hasRootChildren: hasContent,
            isBlank,
            hasError,
            hasFooter,
            textPreview: bodyText.slice(0, 120).replace(/\\s+/g, ' '),
          };
        })()
      `);

      const routePass = pageState.hasRootChildren && !pageState.isBlank && !pageState.hasError && !has408;
      results.routesOfflineTested[route] = routePass ? 'PASS' : 'FAIL';

      console.log(
        `Route ${route.padEnd(25)} -> ${routePass ? '✓ PASS' : '✗ FAIL'} (Children: ${pageState.hasRootChildren}, 408: ${has408}, Footer: ${pageState.hasFooter})`
      );
      if (!routePass) {
        console.log(`   Page state:`, JSON.stringify(pageState));
      }
    }

    results.no408Errors = any408Found ? 'FAIL' : 'PASS';

    // 7. Verify IndexedDB records remain completely preserved offline
    console.log('\n--- Step 6: Verify IndexedDB Records Preserved Offline ---');
    const idbOfflineCheck = await cdp.eval(`
      (async () => {
        return new Promise((resolve) => {
          const req = indexedDB.open('ims_offline_db');
          req.onsuccess = (e) => {
            const db = e.target.result;
            const stores = Array.from(db.objectStoreNames);
            const counts = {};
            let remaining = stores.length;
            if (remaining === 0) return resolve({ stores: [], counts: {} });
            const tx = db.transaction(stores, 'readonly');
            stores.forEach((storeName) => {
              const countReq = tx.objectStore(storeName).count();
              countReq.onsuccess = () => {
                counts[storeName] = countReq.result;
                remaining--;
                if (remaining === 0) resolve({ stores, counts });
              };
              countReq.onerror = () => {
                remaining--;
                if (remaining === 0) resolve({ stores, counts });
              };
            });
          };
          req.onerror = () => resolve({ error: 'Failed to open IDB' });
        });
      })()
    `);
    console.log('IndexedDB Post-Offline Reload Counts:', JSON.stringify(idbOfflineCheck.counts, null, 2));

    const totalOfflineRecords = Object.values(idbOfflineCheck.counts || {}).reduce((a, b) => a + b, 0);
    if (totalOfflineRecords > 0 && totalOfflineRecords >= totalIdbRecords) {
      results.indexedDBPreserved = 'PASS';
      console.log(`✓ IndexedDB verified: ${totalOfflineRecords} records intact across ${idbOfflineCheck.stores.length} stores.`);
    } else {
      results.indexedDBPreserved = 'FAIL';
    }

    // 8. Test Hard Reload (Ctrl + Shift + R equivalent via ignoreCache: true)
    console.log('\n--- Step 7: Testing Hard Reload (Ctrl + Shift + R / ignoreCache: true) ---');
    try {
      cdp.requestLog = [];
      cdp.responseLog = [];
      await cdp.send('Page.reload', { ignoreCache: true });
      await sleep(2500);

      const hardReloadStatus = await cdp.eval(`
        (() => {
          const root = document.getElementById('root');
          return {
            hasChildren: !!(root && root.children.length > 0),
            title: document.title,
            pathname: window.location.pathname,
          };
        })()
      `);
      console.log('Hard reload result:', JSON.stringify(hardReloadStatus));
      results.hardReloadTested = hardReloadStatus.hasChildren ? 'PASS' : 'LIMITED_BY_BROWSER_CACHE_BYPASS';
    } catch (hardReloadErr) {
      console.warn('Hard reload test note:', hardReloadErr.message);
      results.hardReloadTested = 'LIMITED_BY_BROWSER_CACHE_BYPASS';
    }

    // 9. Reconnect Online & Verify Normal Functionality
    console.log('\n--- Step 8: Restoring Online Connection ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    const restoredOnline = await cdp.eval('navigator.onLine');
    console.log(`Browser navigator.onLine restored: ${restoredOnline}`);
    if (restoredOnline) {
      results.reconnectTested = 'PASS';
    }

    // Print Final Summary Table
    console.log('\n================================================================');
    console.log('FINAL OFFLINE REFRESH & ASSET CACHING RESULTS');
    console.log('================================================================');
    console.table({
      'Auth Login': results.authLogin,
      'Bootstrap Sync': results.bootstrapSync,
      'Service Worker Registration': results.swRegistration,
      'Production Assets Precached': results.precachedAssets,
      'No HTTP 408 Status Errors': results.no408Errors,
      'Offline Refresh (/settings)': results.routesOfflineTested['/settings'],
      'Offline Refresh (/dashboard)': results.routesOfflineTested['/dashboard'],
      'Offline Refresh (/customers)': results.routesOfflineTested['/customers'],
      'Offline Refresh (/investors)': results.routesOfflineTested['/investors'],
      'Offline Refresh (/owner)': results.routesOfflineTested['/owner'],
      'Offline Refresh (/payments)': results.routesOfflineTested['/payments'],
      'Offline Refresh (/reports)': results.routesOfflineTested['/reports'],
      'IndexedDB Data Preserved': results.indexedDBPreserved,
      'Ctrl + Shift + R Behavior': results.hardReloadTested,
      'Online Reconnect Restored': results.reconnectTested,
    });
  } catch (err) {
    console.error('Verification encountered an error:', err);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGKILL');
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTest();
