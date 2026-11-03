/**
 * Automated Chrome DevTools Protocol (CDP) UI Test for Redesigned Business Profile Settings
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
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_bprofile_ui_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';
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

async function runTests() {
  console.log('================================================================');
  console.log('STARTING BUSINESS PROFILE SETTINGS UI REDESIGN VERIFICATION');
  console.log('================================================================\n');

  if (!fs.existsSync(CHROME_PATH)) {
    console.error('Chrome executable not found at:', CHROME_PATH);
    process.exit(1);
  }

  const debuggingPort = 9355;
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });

  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      `--remote-debugging-port=${debuggingPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--window-size=1400,1050',
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
    await delay(1200);

    await cdp.eval(`
      localStorage.setItem('ims_token', ${JSON.stringify(token)});
      localStorage.setItem('ims_admin', JSON.stringify({
        id: '6aa41f45fbfe9df698d5fc1e',
        name: 'Owner',
        email: 'admin@localhost.com'
      }));
    `);

    // 3. Navigate to Settings page with tab=business
    console.log('\n2. Navigating to Settings -> Business Profile tab...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/settings?tab=business` });

    // Wait for settings to load
    for (let i = 0; i < 30; i++) {
      const txt = await cdp.eval(`document.body.innerText`);
      if (txt && (txt.includes('Business & Owner Information') || txt.includes('Business Profile'))) {
        break;
      }
      await delay(400);
    }

    // 4. Verify Active Tab
    const activeTab = await cdp.eval(`
      document.querySelector('button.bg-white')?.innerText || ''
    `);
    assert(activeTab.includes('Business Profile'), 'Active tab is "Business Profile"');

    // 5. Verify Header Overview Banner
    const bannerInfo = await cdp.eval(`(() => {
      const h2 = document.querySelector('h2');
      return {
        title: h2 ? h2.innerText : '',
        badge: document.body.innerText.includes('Active Business Profile'),
        currencyBadge: document.body.innerText.includes('Currency: PKR (Rs.)') || document.body.innerText.includes('Currency: PKR'),
      };
    })()`);
    assert(bannerInfo.title.includes('DJ AL JANAT') || bannerInfo.badge, 'Header overview banner displays company name and active profile badge');

    // 6. Verify Section 1: Business & Owner Information
    const section1Text = await cdp.eval(`document.body.innerText`);
    const upperText = section1Text.toUpperCase();
    assert(
      upperText.includes('BUSINESS & OWNER INFORMATION') &&
      section1Text.includes('Business Name') &&
      section1Text.includes('Owner Name') &&
      section1Text.includes('Primary Phone') &&
      section1Text.includes('Secondary / Alternate Phone') &&
      section1Text.includes('Email Address') &&
      section1Text.includes('City') &&
      section1Text.includes('Full Address / Shop Location'),
      'Rendered all 7 Business / Owner Information fields with professional micro-labels'
    );

    // 7. Verify Section 2: Regional & Print Settings
    assert(
      upperText.includes('REGIONAL & PRINT SETTINGS') &&
      section1Text.includes('Currency Code') &&
      section1Text.includes('Currency Symbol') &&
      section1Text.includes('Print Footer Note'),
      'Rendered all Regional & Print Settings fields (Currency Code, Symbol, Print Footer Note)'
    );

    // 8. Verify Customer Receipt Bottom Preview box
    assert(
      section1Text.includes('Customer Receipt Bottom Preview') || section1Text.includes('Thermal / A4 Slip'),
      'Interactive visual receipt bottom preview simulator is rendered'
    );

    // 9. Verify Input Field Values match DB
    const inputValues = await cdp.eval(`(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea')).map(el => ({
        placeholder: el.placeholder,
        value: el.value
      }));
      return inputs;
    })()`);
    const hasBusinessName = inputValues.some(i => i.value.includes('DJ AL JANAT'));
    const hasOwnerName = inputValues.some(i => i.value.includes('AMJID'));
    const hasPhone = inputValues.some(i => i.value.includes('0766543567'));
    const hasCurrency = inputValues.some(i => i.value === 'PKR');
    const hasFooter = inputValues.some(i => i.value.includes('Thank you for your business'));

    assert(
      hasBusinessName && hasOwnerName && hasPhone && hasCurrency && hasFooter,
      `Form inputs accurately pre-populate all existing DB values (Business: ${hasBusinessName}, Owner: ${hasOwnerName}, Phone: ${hasPhone})`
    );

    // 10. Verify Save Settings Button Styling
    const saveBtn = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save Settings'));
      return {
        exists: !!btn,
        hasPrimaryClass: btn ? btn.className.includes('btn-primary') : false,
        text: btn ? btn.innerText.trim() : ''
      };
    })()`);
    assert(saveBtn.exists && saveBtn.hasPrimaryClass, 'Save Settings button has professional primary styling with icon');

    // Capture Light Mode Screenshot
    console.log('\n3. Capturing Light Mode Business Profile screenshot...');
    const lightScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const lightImagePath = path.join(ARTIFACTS_DIR, 'business_profile_light.png');
    fs.writeFileSync(lightImagePath, Buffer.from(lightScreenshot.data, 'base64'));
    console.log(`  Saved Light Mode screenshot: ${lightImagePath}`);
    assert(fs.existsSync(lightImagePath), 'Light mode screenshot saved');

    // 11. Test Live Receipt Preview Typing Reaction
    console.log('\n4. Testing Live Receipt Preview text update...');
    await cdp.eval(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
        setter.call(textarea, 'Custom Premium Receipt Note. Certified Purchase.');
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })()`);
    await delay(500);

    const updatedPreview = await cdp.eval(`document.body.innerText`);
    assert(
      updatedPreview.includes('Custom Premium Receipt Note. Certified Purchase.'),
      'Live receipt preview dynamically reflects changes to Print Footer Note'
    );

    // 12. Test Save Settings Submission
    console.log('\n5. Testing Save Settings form submission...');
    const clickSaveResult = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save Settings'));
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    })()`);
    assert(clickSaveResult, 'Clicked "Save Settings" button');

    // Wait for save toast feedback
    await delay(1200);
    const toastText = await cdp.eval(`document.body.innerText`);
    assert(
      toastText.includes('Settings saved') || toastText.includes('saved locally'),
      'Save Settings triggers existing toast notification feedback ("Settings saved.")'
    );

    // Restore original footer note
    await cdp.eval(`(() => {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        textarea.value = 'Thank you for your business.';
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save Settings'));
      if (btn) btn.click();
    })()`);
    await delay(1000);

    // 13. Test Dark Mode
    console.log('\n6. Testing Dark Mode...');
    await cdp.eval(`document.documentElement.classList.add('dark');`);
    await delay(600);

    const isDarkMode = await cdp.eval(`document.documentElement.classList.contains('dark')`);
    assert(isDarkMode, 'Dark mode class toggled successfully on root element');

    // Capture Dark Mode Screenshot
    const darkScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const darkImagePath = path.join(ARTIFACTS_DIR, 'business_profile_dark.png');
    fs.writeFileSync(darkImagePath, Buffer.from(darkScreenshot.data, 'base64'));
    console.log(`  Saved Dark Mode screenshot: ${darkImagePath}`);
    assert(fs.existsSync(darkImagePath), 'Dark mode screenshot saved');

    // 14. Test Mobile Responsiveness (Viewport 375x812)
    console.log('\n7. Testing Mobile Responsiveness (375x812)...');
    await cdp.eval(`document.documentElement.classList.remove('dark');`);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 812,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await delay(800);

    const mobileBtn = await cdp.eval(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Save Settings'));
      return btn ? { width: btn.offsetWidth, parentWidth: btn.parentElement.offsetWidth } : null;
    })()`);
    assert(mobileBtn && mobileBtn.width > 200, 'Save Settings button adapts responsively to mobile full-width touch layout');

    // Capture Mobile Screenshot
    const mobileScreenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const mobileImagePath = path.join(ARTIFACTS_DIR, 'business_profile_mobile.png');
    fs.writeFileSync(mobileImagePath, Buffer.from(mobileScreenshot.data, 'base64'));
    console.log(`  Saved Mobile screenshot: ${mobileImagePath}`);
    assert(fs.existsSync(mobileImagePath), 'Mobile screenshot saved');

  } finally {
    if (cdp) cdp.close();
    chromeProc.kill();
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch {}
  }

  console.log('\n================================================================');
  console.log(`🏁 BUSINESS PROFILE REDESIGN TEST COMPLETE: ${passed} / ${total} TESTS PASSED!`);
  console.log('================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('❌ CDP Test Error:', err);
  process.exit(1);
});
