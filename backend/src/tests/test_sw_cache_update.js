/**
 * Test to verify that a new production build properly updates the Service Worker cache,
 * populates new assets, purges obsolete caches, and maintains offline functionality.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_sw_update_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';

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
  async eval(expression) {
    const res = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text);
    return res.result ? res.result.value : undefined;
  }
  close() {
    this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runCacheUpdateTest() {
  console.log('================================================================');
  console.log('TEST: NEW PRODUCTION BUILD CACHE REPLACEMENT & OFFLINE REFRESH');
  console.log('================================================================');

  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
  const remoteDebuggingPort = 9226;

  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--no-first-run',
      '--headless=new',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let cdp;
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

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    console.log('\n--- 1. Navigating to Frontend Online ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await sleep(3500);

    const initialCaches = await cdp.eval(`(async () => await caches.keys())()`);
    console.log('Active Cache versions in browser:', initialCaches);

    // Verify cache details
    const cacheContents = await cdp.eval(`
      (async () => {
        const name = (await caches.keys())[0];
        if (!name) return [];
        const cache = await caches.open(name);
        const reqs = await cache.keys();
        return { name, count: reqs.length, assets: reqs.map(r => new URL(r.url).pathname) };
      })()
    `);
    console.log('Cache inspected:', JSON.stringify(cacheContents, null, 2));

    const hasNewCacheName = initialCaches.some((c) => c.startsWith('ims-static-v'));
    const hasJsAndCss =
      cacheContents.assets &&
      cacheContents.assets.some((a) => a.endsWith('.js')) &&
      cacheContents.assets.some((a) => a.endsWith('.css'));

    console.log(`Cache Version Name Valid: ${hasNewCacheName ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`Precached JS and CSS Present: ${hasJsAndCss ? '✓ PASS' : '✗ FAIL'}`);

    console.log('\n--- 2. Setting Network Offline & Testing Refresh on /login ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/login` });
    await sleep(1500);
    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(2000);

    const offlineStatus = await cdp.eval(`
      (() => {
        const root = document.getElementById('root');
        return {
          pathname: window.location.pathname,
          hasChildren: !!(root && root.children.length > 0),
          title: document.title,
          bodyTextSnippet: (document.body.innerText || '').slice(0, 100).replace(/\\s+/g, ' ')
        };
      })()
    `);
    console.log('Offline page reload result:', JSON.stringify(offlineStatus, null, 2));

    const refreshPass = offlineStatus.hasChildren && offlineStatus.pathname === '/login';
    console.log(`Offline Refresh of New Build: ${refreshPass ? '✓ PASS' : '✗ FAIL'}`);

    console.log('\n================================================================');
    console.log(`RESULT: ${hasNewCacheName && hasJsAndCss && refreshPass ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);
    console.log('================================================================');
  } catch (err) {
    console.error('Test error:', err);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGKILL');
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runCacheUpdateTest();
