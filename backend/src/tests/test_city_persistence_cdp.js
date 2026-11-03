/**
 * Automated Verification for City Input Save & Persistence
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const jwt = require('jsonwebtoken');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_city_test_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000';
const ARTIFACTS_DIR = 'C:\\Users\\M SHOUKAT-ENGINEER\\.gemini\\antigravity\\brain\\fa183b57-609d-4e08-8302-f5596f164154';

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
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  console.log('================================================================');
  console.log('  TESTING CITY INPUT SAVE & PERSISTENCE IN BUSINESS PROFILE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(title, condition, extra = '') {
    if (condition) {
      console.log(`  ✓ ${title} ${extra ? `(${extra})` : ''}`);
      passed++;
    } else {
      console.error(`  ✗ ${title} ${extra ? `(${extra})` : ''}`);
      failed++;
    }
  }

  const chromePort = 9460;
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });

  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${chromePort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--headless=new',
      '--disable-extensions',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  let cdp;
  try {
    let versionInfo;
    for (let i = 0; i < 20; i++) {
      try {
        versionInfo = await httpGetJson(`http://127.0.0.1:${chromePort}/json/version`);
        if (versionInfo && versionInfo.webSocketDebuggerUrl) break;
      } catch (e) {
        await sleep(250);
      }
    }

    const targets = await httpGetJson(`http://127.0.0.1:${chromePort}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');

    const secret = 'dev_installment_system_secret_2026_change_later';
    const adminObj = {
      _id: '6aa41f45fbfe9df698d5fc1e',
      id: '6aa41f45fbfe9df698d5fc1e',
      name: 'Owner',
      email: 'admin@localhost.com',
      role: 'admin',
    };
    const token = jwt.sign({ id: adminObj._id, role: 'admin' }, secret, { expiresIn: '7d' });

    await cdp.send('Page.navigate', { url: FRONTEND_URL + '/login' });
    await sleep(1500);

    await cdp.eval(`
      localStorage.setItem('ims_token', ${JSON.stringify(token)});
      localStorage.setItem('ims_admin', JSON.stringify(${JSON.stringify(adminObj)}));
      localStorage.setItem('ims_theme', 'light');
    `);

    // Navigate to Settings page
    await cdp.send('Page.navigate', { url: FRONTEND_URL + '/settings?tab=business' });

    // Wait for City input field to be present
    let cityInputFound = false;
    for (let i = 0; i < 30; i++) {
      await sleep(250);
      cityInputFound = await cdp.eval(`
        Boolean(document.querySelector('input[placeholder*="Kohat"]'))
      `);
      if (cityInputFound) break;
    }
    assert('Settings page loaded and City input is present', cityInputFound);

    // Step 1: Set City to "Kohat" using React's value setter and trigger change event
    console.log('\n--- Step 1: Entering "Kohat" into City input field ---');
    const enteredVal = await cdp.eval(`
      (() => {
        const input = document.querySelector('input[placeholder*="Kohat"]');
        if (!input) return null;
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        nativeInputValueSetter.call(input, 'Kohat');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return input.value;
      })()
    `);
    assert('City input accepted value "Kohat"', enteredVal === 'Kohat');

    // Step 2: Click "Save Settings"
    console.log('\n--- Step 2: Clicking "Save Settings" ---');
    await cdp.eval(`
      (() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const saveBtn = btns.find(b => b.innerText.includes('Save Settings'));
        if (saveBtn) saveBtn.click();
      })()
    `);

    // Wait for save completion
    await sleep(2000);

    // Step 3: Refresh the page to test persistence
    console.log('\n--- Step 3: Refreshing page to verify persistence ---');
    await cdp.send('Page.reload');

    // Wait for page to reload and settings to load from API & IndexedDB
    let refreshedCity = null;
    let businessName = null;
    for (let i = 0; i < 30; i++) {
      await sleep(300);
      const res = await cdp.eval(`
        (() => {
          const input = document.querySelector('input[placeholder*="Kohat"]');
          const bName = document.querySelector('input[placeholder*="Business Name"], input[value*="DJ"]');
          if (!input) return null;
          return {
            city: input.value,
            businessName: bName ? bName.value : null
          };
        })()
      `);
      if (res && res.city) {
        refreshedCity = res.city;
        businessName = res.businessName;
        break;
      }
    }

    assert('City persists as "Kohat" after page refresh', refreshedCity === 'Kohat', `found: "${refreshedCity}"`);

    // Check header preview badge
    const headerPreview = await cdp.eval(`
      (() => {
        const ps = Array.from(document.querySelectorAll('p'));
        const sub = ps.find(p => p.innerText.includes('Proprietor') || p.innerText.includes('Installment Financial'));
        return sub ? sub.innerText : '';
      })()
    `);
    assert('Business profile header displays city "Kohat"', headerPreview.includes('Kohat'), `preview: "${headerPreview}"`);

    // Take screenshot of persisted settings
    const ss = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssPath = path.join(ARTIFACTS_DIR, 'city_field_persistence_verified.png');
    fs.writeFileSync(ssPath, Buffer.from(ss.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${path.basename(ssPath)}`);

  } catch (err) {
    console.error('CDP test failed with error:', err);
    failed++;
  } finally {
    if (cdp && cdp.ws) {
      try {
        cdp.ws.close();
      } catch (e) {}
    }
    chromeProc.kill('SIGKILL');
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch (e) {}
  }

  console.log('\n================================================================');
  console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
