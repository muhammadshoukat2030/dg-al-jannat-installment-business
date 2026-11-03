/**
 * Comprehensive Automated Verification Test for Developer Branding Footer
 * Tests:
 * 1. PDF Exports (Receipt, Installment Schedule, Customer Record, Generic Tables)
 *    - Exact footer text: Developed by SHOUKAT | 03348004300 | devzore.com
 *    - Clickable PDF URI annotations: tel:03348004300 and https://devzore.com
 *    - Multi-page coverage with zero ghost pages
 * 2. Excel Exports
 *    - Printed headers/footers
 *    - Caption row hyperlink to https://devzore.com and exact text
 * 3. CDP Browser Verification
 *    - AppLayout footer rendered with exact text & active links
 *    - Light Mode & Dark Mode styling
 *    - Print Media Emulation (@media print):
 *      - Footer visible & styled in #4f46e5
 *      - Header & Sidebar hidden
 *    - Settings Receipt Bottom Preview (Thermal Slip)
 *    - Screenshots saved to artifacts directory
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const zlib = require('zlib');
const { PassThrough } = require('stream');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const Admin = require('../models/Admin');

const {
  DEVELOPER_FOOTER_TEXT,
  startPdf,
  drawHeader,
  drawTable,
  finalizePdf,
  generateReceiptPdf,
  generateInstallmentSheetPdf,
  generateGenericTablePdf,
  generateCustomerFullRecordPdf,
} = require('../utils/pdfGenerator');
const { generateExcel } = require('../utils/excelGenerator');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_footer_ui_${Date.now()}`);
const FRONTEND_URL = 'http://localhost:5173';
const BACKEND_URL = 'http://localhost:5000';
const ARTIFACTS_DIR = 'C:\\Users\\M SHOUKAT-ENGINEER\\.gemini\\antigravity\\brain\\fa183b57-609d-4e08-8302-f5596f164154';

const EXPECTED_FOOTER_TEXT = 'Developed by SHOUKAT | 03348004300 | devzore.com';
const EXPECTED_TEL = 'tel:03348004300';
const EXPECTED_URL = 'https://devzore.com';

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

function pdfHasAnnotationsAndText(pdfBuffer) {
  const raw = pdfBuffer.toString('binary');
  const hasTel = raw.includes(EXPECTED_TEL);
  const hasUrl = raw.includes(EXPECTED_URL);
  const hasLinkSubtype = raw.includes('/Subtype /Link') || raw.includes('/Subtype/Link');

  let fullDecoded = '';
  let searchIdx = 0;
  while (searchIdx < raw.length) {
    const streamStart = raw.indexOf('stream', searchIdx);
    if (streamStart === -1) break;
    let dataStart = streamStart + 6;
    if (raw[dataStart] === '\r') dataStart++;
    if (raw[dataStart] === '\n') dataStart++;
    const streamEnd = raw.indexOf('endstream', dataStart);
    if (streamEnd === -1) break;

    const streamSlice = pdfBuffer.subarray(dataStart, streamEnd);
    try {
      const decompressed = zlib.inflateSync(streamSlice).toString('utf8');
      const tjMatches = decompressed.match(/\[([\s\S]*?)\]\s*TJ/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const hexRegex = /<([0-9a-fA-F]+)>/g;
          let h;
          while ((h = hexRegex.exec(tj)) !== null) {
            fullDecoded += Buffer.from(h[1], 'hex').toString('utf8');
          }
        }
      }
    } catch (e) {}
    searchIdx = streamEnd + 9;
  }

  const hasFullText = fullDecoded.includes(EXPECTED_FOOTER_TEXT);
  const match = raw.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
  const pageCount = match ? parseInt(match[1], 10) : 1;

  return { hasTel, hasUrl, hasLinkSubtype, hasFullText, pageCount };
}

function runPdfStream(generatorFn) {
  return new Promise((resolve) => {
    const stream = new PassThrough();
    stream.setHeader = () => {};
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    generatorFn(stream);
  });
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
  console.log('  DEVELOPER FOOTER BRANDING — AUTOMATED VERIFICATION SUITE');
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

  // =========================================================================
  // TEST GROUP 1: PDF EXPORTS (Receipt, Installment Schedule, Records, Tables)
  // =========================================================================
  console.log('--- TEST GROUP 1: PDF Exports (Receipt, Schedule, Records) ---');

  // 1. Payment Receipt PDF
  const receiptBuf = await runPdfStream((res) => {
    generateReceiptPdf(res, {
      settings: { businessName: 'Quick Installments', receiptFooter: 'Thank you for your business!' },
      customer: { name: 'Ali Khan', contactNumber: '03001234567', cnic: '35201-1234567-1' },
      plan: { productName: 'Samsung 55 Inch LED', sellingPrice: 120000, downPayment: 20000, purchaseCost: 95000, expectedProfit: 25000 },
      installment: { installmentNumber: 1, status: 'PAID' },
      payment: { receiptNumber: 'REC-2026-001', paymentDate: new Date(), amount: 10000, previousBalance: 100000, newBalance: 90000, paymentMethod: 'CASH', notes: 'First monthly installment' },
    });
  });
  const rRes = pdfHasAnnotationsAndText(receiptBuf);
  assert('Receipt PDF contains exact text: ' + EXPECTED_FOOTER_TEXT, rRes.hasFullText);
  assert('Receipt PDF contains tel link: ' + EXPECTED_TEL, rRes.hasTel);
  assert('Receipt PDF contains website link: ' + EXPECTED_URL, rRes.hasUrl);
  assert('Receipt PDF contains link annotations (/Subtype /Link)', rRes.hasLinkSubtype);
  assert('Receipt PDF fits on exactly 1 page (zero ghost page)', rRes.pageCount === 1, `pages: ${rRes.pageCount}`);

  // 2. Installment Sheet PDF
  const scheduleBuf = await runPdfStream((res) => {
    const schedule = [];
    for (let i = 1; i <= 6; i++) {
      schedule.push({ installmentNumber: i, monthLabel: `Month ${i}`, dueDate: new Date(), amountDue: 10000, paidAmount: i === 1 ? 10000 : 0, status: i === 1 ? 'PAID' : 'PENDING' });
    }
    generateInstallmentSheetPdf(res, {
      settings: { businessName: 'Quick Installments' },
      customer: { name: 'Ali Khan', contactNumber: '03001234567' },
      plan: { contractId: 'PLAN-001', productName: 'Samsung LED', sellingPrice: 60000, monthlyInstallment: 10000, downPayment: 0, totalPaid: 10000, remainingAmount: 50000 },
      schedule,
    });
  });
  const sRes = pdfHasAnnotationsAndText(scheduleBuf);
  assert('Installment Sheet PDF contains exact footer text', sRes.hasFullText);
  assert('Installment Sheet PDF contains tel link', sRes.hasTel);
  assert('Installment Sheet PDF contains website link', sRes.hasUrl);
  assert('Installment Sheet PDF is exactly 1 page', sRes.pageCount === 1);

  // 3. Customer Full Record Multi-page PDF
  const fullRecordBuf = await runPdfStream((res) => {
    const plans = [{ contractId: 'PLAN-001', productName: 'Solar System 5KW', sellingPrice: 500000, purchaseCost: 400000, downPayment: 100000, remainingAmount: 400000, installmentDurationMonths: 12, monthlyInstallment: 33333, status: 'ACTIVE', totalPaid: 100000 }];
    const schedule = [];
    for (let i = 1; i <= 24; i++) {
      schedule.push({ planId: 'PLAN-001', installmentNumber: i, dueDate: new Date(), amountDue: 33333, paidAmount: 0, status: 'PENDING' });
    }
    const payments = [];
    for (let i = 1; i <= 15; i++) {
      payments.push({ paymentDate: new Date(), amount: 33333, paymentMethod: 'BANK', receiptNumber: `REC-${1000 + i}`, newBalance: 400000 - i * 33333 });
    }
    const missedEvents = [];
    generateCustomerFullRecordPdf(res, {
      settings: { businessName: 'Solar Solutions' },
      customer: { customerId: 'CUST-001', name: 'Zubair Ahmed', contactNumber: '03123456789' },
      plans,
      schedule,
      payments,
      missedEvents,
    });
  });
  const frRes = pdfHasAnnotationsAndText(fullRecordBuf);
  assert('Customer Full Record PDF contains exact footer text', frRes.hasFullText);
  assert('Customer Full Record PDF contains tel link', frRes.hasTel);
  assert('Customer Full Record PDF contains website link', frRes.hasUrl);
  assert('Customer Full Record PDF multi-page stamped properly', frRes.pageCount >= 2, `pages: ${frRes.pageCount}`);

  // 4. Generic Table PDF
  const genericBuf = await runPdfStream((res) => {
    generateGenericTablePdf(res, {
      settings: { businessName: 'Quick Installments' },
      title: 'OVERDUE INSTALLMENTS REPORT',
      filename: 'overdue.pdf',
      columns: [{ header: 'Customer', key: 'name', width: 200 }, { header: 'Due', key: 'due', width: 100 }],
      rows: [{ name: 'Customer A', due: '15,000' }, { name: 'Customer B', due: '25,000' }],
    });
  });
  const gRes = pdfHasAnnotationsAndText(genericBuf);
  assert('Generic Table PDF contains exact footer text', gRes.hasFullText);
  assert('Generic Table PDF contains tel link', gRes.hasTel);
  assert('Generic Table PDF contains website link', gRes.hasUrl);

  // =========================================================================
  // TEST GROUP 2: EXCEL EXPORTS
  // =========================================================================
  console.log('\n--- TEST GROUP 2: Excel Exports ---');
  const excelBuf = await runPdfStream((res) => {
    generateExcel(res, {
      filename: 'test-export.xlsx',
      sheetName: 'Report',
      columns: [{ header: 'Item', key: 'item', width: 20 }, { header: 'Price', key: 'price', width: 15 }],
      rows: [{ item: 'Refrigerator', price: '75,000' }],
    });
  });
  assert('Excel export generated successfully', excelBuf.length > 500, `size: ${excelBuf.length} bytes`);

  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(excelBuf);
  const sheet = wb.getWorksheet(1);
  const oddFooter = sheet.headerFooter?.oddFooter || '';
  const evenFooter = sheet.headerFooter?.evenFooter || '';
  assert('Excel export oddFooter contains exact branding', oddFooter.includes(EXPECTED_FOOTER_TEXT));
  assert('Excel export evenFooter contains exact branding', evenFooter.includes(EXPECTED_FOOTER_TEXT));

  let hasCaptionHyperlink = false;
  let captionText = '';
  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (cell.value && typeof cell.value === 'object' && cell.value.hyperlink?.includes('devzore.com')) {
        hasCaptionHyperlink = true;
        captionText = cell.value.text || '';
      }
    });
  });
  assert('Excel export caption row contains clickable devzore.com link', hasCaptionHyperlink);
  assert('Excel export caption row matches exact branding text', captionText === EXPECTED_FOOTER_TEXT);

  // =========================================================================
  // TEST GROUP 3: LIVE CDP BROWSER VERIFICATION
  // =========================================================================
  console.log('\n--- TEST GROUP 3: Live CDP Browser UI Verification ---');
  const chromePort = 9444;
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

    if (!versionInfo || !versionInfo.webSocketDebuggerUrl) {
      throw new Error('Failed to connect to headless Chrome via CDP');
    }

    const targets = await httpGetJson(`http://127.0.0.1:${chromePort}/json/list`);
    const pageTarget = targets.find((t) => t.type === 'page' && !t.url.startsWith('chrome-extension://')) || targets[0];
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect('mongodb://127.0.0.1:27017/installment_management3');
    }
    const admin = await Admin.findOne();
    const adminId = admin ? String(admin._id) : '6aa41f45fbfe9df698d5fc1e';
    const adminObj = {
      _id: adminId,
      id: adminId,
      name: admin?.name || 'Administrator',
      email: admin?.email || 'admin@localhost.com',
      role: 'admin',
    };
    const secret = process.env.JWT_SECRET || 'dev_installment_system_secret_2026_change_later';
    const token = jwt.sign({ id: adminId, role: 'admin' }, secret, { expiresIn: '7d' });

    await cdp.send('Page.navigate', { url: FRONTEND_URL + '/login' });
    await sleep(1500);

    await cdp.eval(`
      localStorage.setItem('ims_token', ${JSON.stringify(token)});
      localStorage.setItem('ims_admin', JSON.stringify(${JSON.stringify(adminObj)}));
      localStorage.setItem('ims_theme', 'light');
    `);

    // 1. Dashboard View (Light Mode)
    await cdp.send('Page.navigate', { url: FRONTEND_URL + '/' });
    let footerInfo = null;
    for (let i = 0; i < 25; i++) {
      await sleep(300);
      footerInfo = await cdp.eval(`
        (() => {
          const footer = document.querySelector('.developer-branding-footer[data-testid="developer-footer"]');
          if (!footer) return null;
          const text = footer.innerText.replace(/\\s+/g, ' ').trim();
          const telLink = footer.querySelector('a[href^="tel:"]');
          const webLink = footer.querySelector('a[href*="devzore.com"]');
          const computedStyle = window.getComputedStyle(footer);
          const spanStyle = window.getComputedStyle(footer.querySelector('span') || footer);
          return {
            exists: true,
            text,
            telHref: telLink ? telLink.getAttribute('href') : null,
            telText: telLink ? telLink.innerText.trim() : null,
            webHref: webLink ? webLink.getAttribute('href') : null,
            webText: webLink ? webLink.innerText.trim() : null,
            color: spanStyle.color,
            display: computedStyle.display,
          };
        })()
      `);
      if (footerInfo) break;
    }

    assert('AppLayout renders developer footer element', footerInfo && footerInfo.exists);
    assert('Developer footer exact text matches', footerInfo?.text === EXPECTED_FOOTER_TEXT, `found: "${footerInfo?.text}"`);
    assert('Developer footer has tel:03348004300 link', footerInfo?.telHref === EXPECTED_TEL);
    assert('Developer footer has https://devzore.com link', footerInfo?.webHref === EXPECTED_URL);
    assert('Developer footer uses subtle accent color (Indigo)', footerInfo?.color?.includes('79, 70, 229') || footerInfo?.color?.includes('99, 102, 241'), `color: ${footerInfo?.color}`);

    // Take screenshot of Light Mode Dashboard with Footer
    const ssLight = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssLightPath = path.join(ARTIFACTS_DIR, 'developer_footer_dashboard_light.png');
    fs.writeFileSync(ssLightPath, Buffer.from(ssLight.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${path.basename(ssLightPath)}`);

    // 2. Dark Mode styling check
    await cdp.eval(`
      document.documentElement.classList.add('dark');
      localStorage.setItem('ims_theme', 'dark');
    `);
    await sleep(400);

    const darkInfo = await cdp.eval(`
      (() => {
        const footer = document.querySelector('.developer-branding-footer[data-testid="developer-footer"]');
        const span = footer.querySelector('span');
        return {
          color: window.getComputedStyle(span || footer).color,
        };
      })()
    `);
    assert('Dark mode maintains readable accent color', darkInfo?.color?.includes('129, 140, 248') || darkInfo?.color?.includes('99, 102, 241') || darkInfo?.color?.includes('79, 70, 229'), `dark color: ${darkInfo?.color}`);

    // Take screenshot of Dark Mode
    const ssDark = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssDarkPath = path.join(ARTIFACTS_DIR, 'developer_footer_dashboard_dark.png');
    fs.writeFileSync(ssDarkPath, Buffer.from(ssDark.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${path.basename(ssDarkPath)}`);

    // 3. Print Media Emulation check (@media print)
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    await sleep(400);

    const printInfo = await cdp.eval(`
      (() => {
        const footer = document.querySelector('.developer-branding-footer[data-testid="developer-footer"]');
        const aside = document.querySelector('aside');
        const header = document.querySelector('header');
        if (!footer) return null;
        const fStyle = window.getComputedStyle(footer);
        const aStyle = aside ? window.getComputedStyle(aside) : null;
        const hStyle = header ? window.getComputedStyle(header) : null;
        return {
          footerDisplay: fStyle.display,
          footerVisibility: fStyle.visibility,
          footerColor: fStyle.color,
          asideDisplay: aStyle ? aStyle.display : 'none',
          headerDisplay: hStyle ? hStyle.display : 'none',
          breakInside: fStyle.breakInside || fStyle.pageBreakInside,
        };
      })()
    `);

    assert('Print mode: developer footer is visible', printInfo?.footerDisplay === 'block' && printInfo?.footerVisibility === 'visible');
    assert('Print mode: developer footer maintains indigo accent #4f46e5', printInfo?.footerColor?.includes('79, 70, 229'), `color: ${printInfo?.footerColor}`);
    assert('Print mode: aside (navigation) is hidden (display: none)', printInfo?.asideDisplay === 'none');
    assert('Print mode: header is hidden (display: none)', printInfo?.headerDisplay === 'none');
    assert('Print mode: break-inside avoid prevents pagination cutoffs', printInfo?.breakInside === 'avoid');

    // Take screenshot of Print Mode Emulation
    const ssPrint = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssPrintPath = path.join(ARTIFACTS_DIR, 'developer_footer_print_emulation.png');
    fs.writeFileSync(ssPrintPath, Buffer.from(ssPrint.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${path.basename(ssPrintPath)}`);

    // Reset media emulation
    await cdp.send('Emulation.setEmulatedMedia', { media: '' });

    // 4. Settings Page: Thermal Slip / Receipt Bottom Preview check
    await cdp.send('Page.navigate', { url: FRONTEND_URL + '/settings?tab=business' });
    let thermalInfo = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      await sleep(250);
      thermalInfo = await cdp.eval(`
        (() => {
          const thermal = document.querySelector('[data-testid="developer-footer-thermal"]');
          if (!thermal) return null;
          return {
            text: thermal.innerText.replace(/\\s+/g, ' ').trim(),
            fontFamily: window.getComputedStyle(thermal).fontFamily,
            fontSize: window.getComputedStyle(thermal).fontSize,
          };
        })()
      `);
      if (thermalInfo) break;
    }

    assert('Settings page renders thermal slip receipt footer', thermalInfo !== null);
    assert('Thermal receipt footer text matches exact branding', thermalInfo?.text === EXPECTED_FOOTER_TEXT, `found: "${thermalInfo?.text}"`);
    assert('Thermal slip uses monospace typography', thermalInfo?.fontFamily?.includes('mono'));

    // Take screenshot of Settings page thermal preview
    const ssThermal = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const ssThermalPath = path.join(ARTIFACTS_DIR, 'developer_footer_settings_receipt_preview.png');
    fs.writeFileSync(ssThermalPath, Buffer.from(ssThermal.data, 'base64'));
    console.log(`  ✓ Saved screenshot: ${path.basename(ssThermalPath)}`);
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
