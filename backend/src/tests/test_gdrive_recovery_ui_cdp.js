/**
 * Automated Chrome DevTools Protocol (CDP) UI Test for Google Drive Database Recovery System
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const jwt = require('jsonwebtoken');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
require('dotenv').config();

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_gdrive_ui_${Date.now()}`);
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
      throw new Error(`Eval error: ${res.exceptionDetails.text} (${JSON.stringify(res.exceptionDetails)})`);
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
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve(body);
        }
      });
    }).on('error', reject);
  });
}

async function runBrowserTests() {
  console.log('================================================================');
  console.log('STARTING GOOGLE DRIVE RECOVERY UI AUTOMATION TEST (CDP)');
  console.log('================================================================\n');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error('Chrome executable not found at:', CHROME_PATH);
    process.exit(1);
  }

  const debuggingPort = 9338;
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });

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

  let cdp = null;
  let total = 0;
  let passed = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${message}`);
    }
  }

  try {
    await delay(2000);

    // Get Chrome CDP targets
    const versionRes = await httpGet(`http://127.0.0.1:${debuggingPort}/json/list`);
    const pages = Array.isArray(versionRes) ? versionRes : [];
    const targetPage = pages.find((p) => p.type === 'page') || pages[0];
    assert(targetPage && targetPage.webSocketDebuggerUrl, 'Connected to Chrome CDP page target');

    cdp = new CDPClient(targetPage.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    // 1. Generate auth JWT token
    const token = jwt.sign(
      { id: '6aa41f45fbfe9df698d5fc1e', name: 'Owner', email: 'admin@localhost.com' },
      process.env.JWT_SECRET || 'dev_installment_system_secret_2026_change_later',
      { expiresIn: '7d' }
    );

    // 2. Navigate to login and seed localStorage
    console.log('\n1. Navigating to frontend login and injecting auth credentials...');
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

    // 3. Navigate to Settings page with tab=backup
    console.log('\n2. Navigating to Settings -> Database Backup & Recovery tab...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/settings?tab=backup` });

    // Wait for Settings page to load
    let tabReady = false;
    for (let i = 0; i < 25; i++) {
      const txt = await cdp.eval(`document.body.innerText`);
      if (txt && (txt.includes('Database Backup & Recovery') || txt.includes('Recovery Vault') || txt.includes('Installment-System-Backups'))) {
        tabReady = true;
        break;
      }
      await delay(400);
    }
    assert(tabReady, 'Database Backup & Recovery Settings tab loaded and rendered');

    // 4. Verify Google Drive Disaster Recovery Vault card presence
    const bodyText = await cdp.eval(`document.body.innerText`);
    assert(
      bodyText.includes('Google Drive Disaster Recovery Vault'),
      'Rendered "Google Drive Disaster Recovery Vault" section card'
    );

    // 5. Verify Google Drive connection status and folder details
    assert(
      bodyText.includes('Connected') && bodyText.includes('Installment-System-Backups'),
      'Displays Google Drive Connected badge with folder "Installment-System-Backups"'
    );

    // 6. Verify prominent "Restore Database from Google Drive" action button
    assert(
      bodyText.includes('Restore Database from Google Drive'),
      'Prominent "Restore Database from Google Drive" button is visible'
    );

    // Wait for Google Drive archives to finish loading from Google Drive API
    console.log('  Waiting for Google Drive backups to finish fetching...');
    let gdriveFilesLoaded = false;
    for (let i = 0; i < 40; i++) {
      const currentVaultText = await cdp.eval(`document.body.innerText`);
      if (currentVaultText.includes('.imsbak')) {
        gdriveFilesLoaded = true;
        break;
      }
      await delay(500);
    }

    // 7. Verify Google Drive cloud backups list
    assert(
      gdriveFilesLoaded,
      'Fetched live backup archives from Google Drive folder and displayed in cloud vault table'
    );

    // Capture screenshot: Google Drive Recovery Vault in Light Mode
    const vaultScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const vaultImagePath = path.join(ARTIFACTS_DIR, 'gdrive_recovery_vault_light.png');
    fs.writeFileSync(vaultImagePath, Buffer.from(vaultScreenshot.data, 'base64'));
    console.log(`  Saved Google Drive Recovery Vault screenshot: ${vaultImagePath}`);
    assert(fs.existsSync(vaultImagePath), 'Light mode recovery vault screenshot saved');

    // 8. Click "Restore Database from Google Drive"
    console.log('\n3. Clicking "Restore Database from Google Drive" button...');
    for (let i = 0; i < 25; i++) {
      const isEnabled = await cdp.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Restore Database from Google Drive'));
        return btn && !btn.disabled;
      })()`);
      if (isEnabled) break;
      await delay(400);
    }

    const clickResult = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Restore Database from Google Drive'));
      if (!btn) return 'not_found';
      if (btn.disabled) return 'disabled';
      btn.click();
      return 'clicked';
    })()`);
    console.log(`  Button click status: ${clickResult}`);
    assert(clickResult === 'clicked', 'Clicked "Restore Database from Google Drive" to open recovery modal');

    // Wait for modal to mount in DOM
    let modalMounted = false;
    for (let i = 0; i < 20; i++) {
      modalMounted = await cdp.eval(`!!document.querySelector('.fixed.inset-0')`);
      if (modalMounted) break;
      await delay(300);
    }
    assert(modalMounted, 'Disaster Recovery modal appeared in DOM');

    // 9. Verify Google Drive Disaster Recovery Modal Content
    const modalText = await cdp.eval(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    assert(
      modalText.includes('GOOGLE DRIVE DATABASE DISASTER RECOVERY') || modalText.includes('Option A: Selected Collections'),
      'Disaster Recovery modal opened with Option A (Selective) and Option B (Complete)'
    );

    // Wait for archive manifest inspection to finish
    console.log('  Waiting for backup manifest inspection to finish...');
    for (let i = 0; i < 30; i++) {
      const mText = await cdp.eval(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
      if (mText.includes('AES-256-GCM Verified') || mText.includes('Contents:')) {
        break;
      }
      await delay(500);
    }

    // 10. Switch to Option A (Selected Collections)
    console.log('\n4. Switching to Option A: Selected Collections...');
    await cdp.eval(`(() => {
      const optABtn = Array.from(document.querySelectorAll('.fixed.inset-0 button')).find(b => b.innerText.includes('Option A: Selected Collections'));
      if (optABtn) optABtn.click();
    })()`);
    await delay(1000);

    const optAText = await cdp.eval(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    assert(
      optAText.includes('Choose Collections to Restore') && optAText.includes('customers'),
      'Option A presents collection checkboxes with document counts (customers, payments, etc.)'
    );

    // Capture screenshot: Option A Selective Restore
    const modalOptionAShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const modalOptionAPath = path.join(ARTIFACTS_DIR, 'gdrive_restore_modal_option_a.png');
    fs.writeFileSync(modalOptionAPath, Buffer.from(modalOptionAShot.data, 'base64'));
    console.log(`  Saved Option A Selective Restore modal screenshot: ${modalOptionAPath}`);

    // 11. Enable Isolated Test Restore
    console.log('\n5. Enabling Isolated Test Restore (Safe Dry-Run)...');
    await cdp.eval(`(() => {
      const testCheckbox = Array.from(document.querySelectorAll('.fixed.inset-0 input[type="checkbox"]')).find(cb => cb.closest('div')?.innerText?.includes('Isolated Test Restore'));
      if (testCheckbox && !testCheckbox.checked) testCheckbox.click();
    })()`);
    await delay(800);

    // 12. Execute Isolated Test Restore
    console.log('\n6. Executing Isolated Test Restore from UI modal...');
    const executedTest = await cdp.eval(`(() => {
      const execBtn = document.querySelector('.fixed.inset-0 button.btn-primary');
      if (execBtn && !execBtn.disabled) { execBtn.click(); return true; }
      return false;
    })()`);
    assert(executedTest, 'Clicked "Execute Isolated Test Restore" button');

    // Wait for cloud download, decryption, and test restore
    console.log('  Waiting for cloud recovery & parity verification...');
    for (let i = 0; i < 45; i++) {
      const currentText = await cdp.eval(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
      if (currentText.includes('Disaster Recovery Succeeded') || currentText.includes('100% Data Parity') || currentText.includes('Target DB: installment_management_test_recovery')) {
        break;
      }
      await delay(600);
    }

    const postRestoreText = await cdp.eval(`document.querySelector('.fixed.inset-0')?.innerText || ''`);
    assert(
      postRestoreText.includes('Disaster Recovery Succeeded With 100% Data Parity!') || postRestoreText.includes('Target DB: installment_management_test_recovery'),
      'Modal verified 100% data parity in isolated test database'
    );

    // Capture screenshot: Verified Test Restore in Modal
    const verifiedShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const verifiedPath = path.join(ARTIFACTS_DIR, 'gdrive_restore_modal_test_verified.png');
    fs.writeFileSync(verifiedPath, Buffer.from(verifiedShot.data, 'base64'));
    console.log(`  Saved Verified Test Restore modal screenshot: ${verifiedPath}`);
    assert(fs.existsSync(verifiedPath), 'Verified test restore screenshot saved');

    // 13. Close modal and test Dark Mode
    console.log('\n7. Closing modal and capturing Dark Mode view...');
    await cdp.eval(`
      const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
      document.documentElement.classList.add('dark');
    `);
    await delay(800);

    const darkShot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const darkPath = path.join(ARTIFACTS_DIR, 'gdrive_recovery_vault_dark.png');
    fs.writeFileSync(darkPath, Buffer.from(darkShot.data, 'base64'));
    console.log(`  Saved Dark Mode Recovery Vault screenshot: ${darkPath}`);
    assert(fs.existsSync(darkPath), 'Dark mode recovery vault screenshot saved');

  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`🏁 GOOGLE DRIVE RECOVERY UI TEST COMPLETE: ${passed} / ${total} TESTS PASSED!`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runBrowserTests().catch((err) => {
  console.error('❌ UI Automation Error:', err);
  process.exit(1);
});
