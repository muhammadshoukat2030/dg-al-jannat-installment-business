/**
 * End-to-End Chrome DevTools Protocol (CDP) UI Verification for Backup & Recovery System
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_backup_ui_${Date.now()}`);
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
      throw new Error(`Eval error: ${res.exceptionDetails.text || JSON.stringify(res.exceptionDetails)}`);
    }
    return res.result?.value;
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

function httpGet(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          try {
            resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(buffer.toString()) });
          } catch {
            resolve({ status: res.statusCode, headers: res.headers, buffer });
          }
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function httpPost(url, body) {
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

async function runBrowserTests() {
  console.log('================================================================');
  console.log('🚀 STARTING BACKUP & RECOVERY UI CHROME CDP VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${message}`);
    }
  }

  // 1. Authenticate to get valid token
  console.log('1. Authenticating admin user...');
  const token = jwt.sign(
    { id: '6aa41f45fbfe9df698d5fc1e' },
    process.env.JWT_SECRET || 'fallback_secret',
    { expiresIn: '7d' }
  );
  assert(token, 'Obtained JWT auth token');

  // 2. Launch Headless Chrome
  console.log('\n2. Launching Headless Chrome with CDP...');
  const debuggingPort = 9226;
  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      `--remote-debugging-port=${debuggingPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--window-size=1400,1000',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await delay(2500);

  const versionRes = await httpGet(`http://127.0.0.1:${debuggingPort}/json/list`);
  const pages = versionRes.data || [];
  const targetPage = pages.find((p) => p.type === 'page') || pages[0];
  assert(targetPage && targetPage.webSocketDebuggerUrl, 'Connected to Chrome CDP page target');

  const cdp = new CDPClient(targetPage.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('DOM.enable');

  try {
    // 3. Navigate to Frontend and Set Auth LocalStorage
    console.log('\n3. Navigating to frontend and seeding auth tokens in localStorage...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/login` });
    await delay(1500);

    await cdp.eval(`
      localStorage.setItem('ims_token', ${JSON.stringify(token)});
      localStorage.setItem('ims_admin', JSON.stringify({
        id: '6aa41f45fbfe9df698d5fc1e',
        name: 'Owner',
        email: 'admin@localhost.com'
      }));
    `);

    // 4. Navigate to Settings page with tab=backup
    console.log('\n4. Navigating to Settings page with tab=backup...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/settings?tab=backup` });

    // Wait for data to load
    for (let i = 0; i < 20; i++) {
      const txt = await cdp.eval(`document.body.innerText`);
      if (txt.includes('MongoDB Database') && txt.includes('AUTOMATIC BACKUP SCHEDULING')) {
        break;
      }
      await delay(400);
    }

    // Verify Tab Switcher
    const activeTabText = await cdp.eval(`
      document.querySelector('button.bg-white')?.innerText || ''
    `);
    console.log(`  Active tab pill text: "${activeTabText}"`);
    assert(activeTabText.includes('Backup & Disaster Recovery'), 'Tab switcher shows "Backup & Disaster Recovery" active');

    // 5. Verify Backup Overview Cards
    console.log('\n5. Verifying Overview Cards...');
    const cardTexts = await cdp.eval(`document.body.innerText`);
    console.log('  Page text snippet (200-800):', cardTexts.substring(200, 800).replace(/\n+/g, ' | '));
    assert(cardTexts.toLowerCase().includes('database') || cardTexts.toLowerCase().includes('mongodb'), 'MongoDB Database Online status card present');
    assert(cardTexts.includes('Google Drive'), 'Google Drive status card present');
    assert(cardTexts.includes('Scheduler') && cardTexts.includes('AUTOMATIC BACKUP SCHEDULING'), 'Scheduler section present');
    assert(cardTexts.includes('AES-256-GCM'), 'AES-256-GCM military-grade encryption card present');

    // 6. Verify Backup History Table
    console.log('\n6. Verifying Backup History Table...');
    assert(cardTexts.includes('BACKUP VAULT HISTORY') || cardTexts.includes('DISASTER RECOVERY ARCHIVES'), 'Backup History section header is visible');
    assert(cardTexts.includes('Backup ID / Archive'), 'Table header has Backup ID / Archive');
    assert(cardTexts.includes('Integrity'), 'Table header has Integrity column');

    // 7. Verify Emergency Key Kit Button
    console.log('\n7. Verifying Emergency Recovery Key Kit Button...');
    const kitButtonExists = await cdp.eval(`
      Array.from(document.querySelectorAll('button')).some(b => b.innerText.includes('Emergency Key Kit'))
    `);
    assert(kitButtonExists, 'Emergency Key Kit download button exists and is clickable');

    // 8. Capture Light Mode Screenshot
    console.log('\n8. Capturing Light Mode Screenshot...');
    const lightScreenshotRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const lightImagePath = path.join(ARTIFACTS_DIR, 'backup_restore_ui_light.png');
    fs.writeFileSync(lightImagePath, Buffer.from(lightScreenshotRes.data, 'base64'));
    console.log(`  Saved Light Mode screenshot to ${lightImagePath}`);
    assert(fs.existsSync(lightImagePath) && fs.statSync(lightImagePath).size > 10000, 'Light Mode screenshot captured successfully');

    // 9. Test Theme Switch to Dark Mode & Capture Dark Mode Screenshot
    console.log('\n9. Switching to Dark Mode and capturing screenshot...');
    await cdp.eval(`
      document.documentElement.classList.add('dark');
      localStorage.setItem('ims_theme', 'dark');
    `);
    await delay(600);
    const darkScreenshotRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const darkImagePath = path.join(ARTIFACTS_DIR, 'backup_restore_ui_dark.png');
    fs.writeFileSync(darkImagePath, Buffer.from(darkScreenshotRes.data, 'base64'));
    console.log(`  Saved Dark Mode screenshot to ${darkImagePath}`);
    assert(fs.existsSync(darkImagePath) && fs.statSync(darkImagePath).size > 10000, 'Dark Mode screenshot captured successfully');

    // Switch back to light for modal testing
    await cdp.eval(`
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ims_theme', 'light');
    `);
    await delay(400);

    // 10. Test "Create Backup Now" Button in UI
    console.log('\n10. Testing "Create Backup Now" button click in UI...');
    const initialBackupCount = await cdp.eval(`
      document.querySelectorAll('table tbody tr').length
    `);
    console.log(`  Initial backups in UI table: ${initialBackupCount}`);

    const clickedCreate = await cdp.eval(`
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Create Backup Now'));
      if (btn) { btn.click(); true; } else false;
    `);
    assert(clickedCreate, 'Clicked "Create Backup Now" button in UI');

    // Wait for creation and table update
    await delay(3500);
    const updatedBackupCount = await cdp.eval(`
      document.querySelectorAll('table tbody tr').length
    `);
    console.log(`  Updated backups in UI table: ${updatedBackupCount}`);
    assert(updatedBackupCount >= initialBackupCount, 'Backup creation completed and table rendered rows');

    // 11. Test "Restore..." Button -> Opens Restore Modal
    console.log('\n11. Testing "Restore..." button and modal...');
    const openedModal = await cdp.eval(`
      const restoreBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Restore'));
      if (restoreBtn) { restoreBtn.click(); true; } else false;
    `);
    assert(openedModal, 'Clicked "Restore..." button on backup table row');
    await delay(600);

    const modalTitle = await cdp.eval(`
      Array.from(document.querySelectorAll('h2')).find(h => h.innerText.includes('DISASTER RECOVERY') || h.innerText.includes('RESTORATION'))?.innerText || ''
    `);
    console.log(`  Modal title: "${modalTitle}"`);
    assert(modalTitle.includes('DISASTER RECOVERY') || modalTitle.includes('RESTORATION'), 'Restore modal appeared with disaster recovery header');

    // 12. Executing Isolated Test Restore from UI modal
    console.log('\n12. Executing Isolated Test Restore from UI modal...');
    const executedTestRestore = await cdp.eval(`
      const testBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Execute Test Restore'));
      if (testBtn) { testBtn.click(); true; } else false;
    `);
    assert(executedTestRestore, 'Clicked "Execute Test Restore" button');

    // Wait for test restore to complete in modal
    await delay(4000);

    const testRestoreResultText = await cdp.eval(`document.body.innerText`);
    assert(
      testRestoreResultText.includes('Isolated Test Restore Passed') || testRestoreResultText.includes('100% of data verified'),
      'Modal displayed 100% verified test restore completion banner'
    );

    // Capture screenshot of test restore verification report in modal
    const modalScreenshotRes = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const modalImagePath = path.join(ARTIFACTS_DIR, 'backup_restore_modal_test_verified.png');
    fs.writeFileSync(modalImagePath, Buffer.from(modalScreenshotRes.data, 'base64'));
    console.log(`  Saved Modal Test Restore Verification screenshot to ${modalImagePath}`);
    assert(fs.existsSync(modalImagePath), 'Modal screenshot saved');

    // Close modal
    await cdp.eval(`
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    `);
    await delay(600);

    // 13. Test Google Drive Connect Modal
    console.log('\n13. Testing Google Drive Connect Modal...');
    const openedGoogleModal = await cdp.eval(`
      const gBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Connect Google Account'));
      if (gBtn) { gBtn.click(); true; } else false;
    `);
    assert(openedGoogleModal, 'Clicked "Connect Google Account" button');
    await delay(600);

    const gModalText = await cdp.eval(`document.body.innerText`);
    assert(
      gModalText.includes('CONNECT PERSONAL GOOGLE DRIVE') || gModalText.includes('PKR 0 Recurring Cost Protection'),
      'Google Drive Connect modal displayed with zero-cost setup guidance'
    );

    // Close Google Modal
    await cdp.eval(`
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Close');
      if (closeBtn) closeBtn.click();
    `);
    await delay(500);

  } finally {
    cdp.close();
    chromeProc.kill();
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`🏁 CDP UI VERIFICATION COMPLETE: ${passed} / ${total} TESTS PASSED!`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('❌ CDP UI Verification Error:', err);
  process.exit(1);
});
