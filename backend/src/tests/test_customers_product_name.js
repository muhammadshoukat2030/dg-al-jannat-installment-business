/**
 * Verification Test Suite: Show Purchased Product Name in Customers Table
 *
 * Tests:
 * 1. Online API: Customer records have productNames and productName.
 * 2. Customer with 1 product: displays product name.
 * 3. Customer with multiple products: displays all product names clearly.
 * 4. Customer with no products: displays 'No Product'.
 * 5. Search by name, phone, CNIC, customer ID, and product name.
 * 6. Excel Export: contains 'Product Name' column with correct values.
 * 7. Chrome DevTools Protocol UI:
 *    - 8 columns in order: Customer ID, Name, Product Name, Phone, CNIC, City, Added, Actions
 *    - UI rendering of single, multiple, and no product
 *    - UI search filtering
 *    - Offline mode & offline hard refresh (Ctrl + R) persistence
 *    - Offline search filtering
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const mongoose = require('mongoose');
const ExcelJS = require('exceljs');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_cust_prod_${Date.now()}`);
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

function httpPost(url, body, token) {
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
  console.log('STARTING CUSTOMERS PRODUCT NAME VERIFICATION TEST SUITE');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const Customer = require('../models/Customer');
  const InstallmentPlan = require('../models/InstallmentPlan');

  // Obtain admin auth token
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
    }
  }

  // Ensure test conditions:
  // 1. A customer with 1 product (e.g. CUST-00002 has 'mobile')
  // 2. An active customer with no product (isArchived: false)
  // 3. A customer with multiple products: CUST-00001 with 'mobile' and 'Honda CD 70'
  const noProdCust = await Customer.create({
    customerId: `TEST-NOPROD-${Date.now().toString().slice(-4)}`,
    name: 'Zero Product Customer',
    contactNumber: '03119998877',
    cnic: '11111-2222333-4',
    city: 'Lahore',
    isArchived: false,
    isDeleted: false,
  });
  console.log(`Created temporary active customer without products: ${noProdCust.customerId}`);

  const cust1 = await Customer.findOne({ customerId: 'CUST-00001' });
  let createdMultiPlan = null;
  if (cust1) {
    const plansForCust1 = await InstallmentPlan.find({ customerId: cust1._id, isDeleted: { $ne: true } });
    const hasHonda = plansForCust1.some((p) => p.productName === 'Honda CD 70');
    if (!hasHonda) {
      createdMultiPlan = await InstallmentPlan.create({
        contractId: `TEST-MULTI-${Date.now().toString().slice(-4)}`,
        customerId: cust1._id,
        productName: 'Honda CD 70',
        productDescription: 'Black 70cc motorcycle',
        purchaseCost: 80000,
        sellingPrice: 100000,
        downPayment: 20000,
        remainingAmount: 80000,
        monthlyInstallment: 8000,
        installmentDurationMonths: 10,
        startDate: new Date(),
        firstDueDate: new Date(Date.now() + 30 * 86400000),
        fundingSource: 'BUSINESS',
        expectedProfit: 20000,
        expectedLoss: 0,
        status: 'ACTIVE',
      });
      console.log('Created second test plan "Honda CD 70" for customer CUST-00001');
    }
  }

  // --- PHASE 1: Online API Customer List & Products ---
  console.log('\n--- PHASE 1: Online API Customer List & Products ---');
  const listRes = await httpGet(`${BACKEND_URL}/api/customers`, token);
  assert(listRes.status === 200, 'GET /api/customers returned 200 OK');
  assert(Array.isArray(listRes.data?.data), 'API returned customer array');

  const customers = listRes.data.data;
  console.log(`Loaded ${customers.length} customers from online API`);

  // Check structure
  const allHaveProductFields = customers.every(
    (c) => Array.isArray(c.productNames) && typeof c.productName === 'string'
  );
  assert(allHaveProductFields, 'All customer records have productNames (array) and productName (string)');

  // Customer with 1 product
  const singleProductCust = customers.find((c) => c.customerId === 'CUST-00002');
  assert(
    singleProductCust && singleProductCust.productNames.length === 1 && singleProductCust.productName === 'mobile',
    `Customer with 1 product (CUST-00002) has productNames: ['mobile'] and productName: 'mobile'`
  );

  // Customer with no product
  const noProductCust = customers.find((c) => c.customerId === noProdCust.customerId);
  assert(
    noProductCust && noProductCust.productNames.length === 0 && noProductCust.productName === 'No Product',
    `Customer with 0 products (${noProdCust.customerId}) has productNames: [] and productName: 'No Product'`
  );

  // Customer with multiple products
  const multiProductCust = customers.find((c) => c.customerId === 'CUST-00001');
  assert(
    multiProductCust &&
      multiProductCust.productNames.length >= 2 &&
      multiProductCust.productNames.includes('mobile') &&
      multiProductCust.productNames.includes('Honda CD 70') &&
      multiProductCust.productName.includes('mobile') &&
      multiProductCust.productName.includes('Honda CD 70'),
    `Customer with multiple products (CUST-00001) has both 'mobile' and 'Honda CD 70' clearly included: "${multiProductCust?.productName}"`
  );

  // --- PHASE 2: Customer Search Tests ---
  console.log('\n--- PHASE 2: Customer Search Tests ---');

  // Search by name
  const nameSearchRes = await httpGet(`${BACKEND_URL}/api/customers?search=ghani`, token);
  assert(
    nameSearchRes.data?.data?.length > 0 &&
      nameSearchRes.data.data.some((c) => c.customerId === 'CUST-00001' && c.productName.includes('Honda CD 70')),
    'Search by name ("ghani") returns customer with product names visible'
  );

  // Search by phone
  const phoneToSearch = singleProductCust?.contactNumber || '03001234567';
  const phoneSearchRes = await httpGet(`${BACKEND_URL}/api/customers?search=${encodeURIComponent(phoneToSearch)}`, token);
  assert(
    phoneSearchRes.data?.data?.length > 0 &&
      phoneSearchRes.data.data[0].contactNumber === phoneToSearch &&
      phoneSearchRes.data.data[0].productName === 'mobile',
    `Search by phone ("${phoneToSearch}") returns customer with product name 'mobile'`
  );

  // Search by CNIC
  const cnicCust = customers.find((c) => c.cnic && c.cnic.trim());
  if (cnicCust) {
    const cnicSearchRes = await httpGet(`${BACKEND_URL}/api/customers?search=${encodeURIComponent(cnicCust.cnic)}`, token);
    assert(
      cnicSearchRes.data?.data?.length > 0 &&
        cnicSearchRes.data.data.some((c) => c.customerId === cnicCust.customerId && c.productName),
      `Search by CNIC ("${cnicCust.cnic}") returns customer with product name`
    );
  } else {
    assert(true, 'Search by CNIC skipped (no cnic customer)');
  }

  // Search by Customer ID
  const idSearchRes = await httpGet(`${BACKEND_URL}/api/customers?search=${encodeURIComponent(noProdCust.customerId)}`, token);
  assert(
    idSearchRes.data?.data?.length === 1 &&
      idSearchRes.data.data[0].customerId === noProdCust.customerId &&
      idSearchRes.data.data[0].productName === 'No Product',
    `Search by Customer ID ("${noProdCust.customerId}") returns customer with "No Product"`
  );

  // Search by Product Name
  const prodSearchRes = await httpGet(`${BACKEND_URL}/api/customers?search=Honda`, token);
  assert(
    prodSearchRes.data?.data?.length > 0 &&
      prodSearchRes.data.data.some((c) => c.customerId === 'CUST-00001'),
    'Search by Product Name ("Honda") finds customer who purchased Honda CD 70'
  );

  // --- PHASE 3: Excel Export Test ---
  console.log('\n--- PHASE 3: Excel Export Test ---');
  const excelRes = await httpGet(`${BACKEND_URL}/api/exports/customers/excel`, token);
  assert(excelRes.status === 200, 'GET /api/exports/customers/excel returned 200 OK');
  assert(
    excelRes.headers['content-type']?.includes('spreadsheetml') || excelRes.headers['content-disposition']?.includes('customers.xlsx'),
    'Excel export returns spreadsheet content'
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(excelRes.buffer);
  const worksheet = workbook.getWorksheet('Customers');
  assert(worksheet !== undefined, 'Excel workbook contains "Customers" worksheet');

  // Verify headers
  const headerRow = worksheet.getRow(1).values;
  // ExcelJS row.values is 1-indexed (index 0 is null/empty)
  const headerTitles = headerRow.slice(1);
  console.log('  Excel Header Columns:', headerTitles);
  assert(headerTitles.includes('Product Name'), 'Excel export includes "Product Name" column');
  assert(
    headerTitles.indexOf('Product Name') === 2, // Customer ID (0), Name (1), Product Name (2)
    'Excel export "Product Name" column is placed immediately after Name'
  );

  // Check rows in Excel
  const excelProductNames = [];
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const pVal = row.getCell(3).value; // Column 3: Product Name
    excelProductNames.push(String(pVal));
  });
  console.log('  Excel Product Names sample:', excelProductNames);
  assert(
    excelProductNames.some((p) => p.includes('mobile')),
    'Excel export contains "mobile" product'
  );
  assert(
    excelProductNames.some((p) => p.includes('Honda CD 70')),
    'Excel export contains "Honda CD 70" product'
  );
  assert(
    excelProductNames.some((p) => p === 'No Product'),
    'Excel export contains "No Product" for customer without contracts'
  );

  // --- PHASE 4: Chrome Browser / UI Testing via CDP ---
  console.log('\n--- PHASE 4: Chrome Browser / UI Testing via CDP ---');

  const debuggingPort = 9223;
  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      `--remote-debugging-port=${debuggingPort}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--headless=new',
      '--window-size=1280,900',
      '--disable-gpu',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  await delay(2500);

  // Query CDP targets
  const versionRes = await httpGet(`http://127.0.0.1:${debuggingPort}/json/list`);
  const pages = versionRes.data || [];
  const targetPage = pages.find((p) => p.type === 'page') || pages[0];
  assert(targetPage && targetPage.webSocketDebuggerUrl, 'Connected to Chrome CDP page target');

  const cdp = new CDPClient(targetPage.webSocketDebuggerUrl);
  await cdp.ready();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');

  // Pre-seed auth token into localStorage
  await cdp.send('Page.navigate', { url: FRONTEND_URL });
  await delay(2000);

  await cdp.send('Runtime.evaluate', {
    expression: `
      localStorage.setItem('ims_token', ${JSON.stringify(token)});
      localStorage.setItem('ims_admin', JSON.stringify({ name: 'Admin', role: 'admin', email: 'admin@localhost.com' }));
      localStorage.setItem('token', ${JSON.stringify(token)});
      localStorage.setItem('user', JSON.stringify({ username: 'admin', role: 'admin' }));
    `,
  });

  // Navigate to Customers page
  console.log('Navigating to Customers page (/customers)...');
  await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/customers` });
  await delay(3000);

  // Wait for table to render if needed
  let retries = 5;
  let uiHeaders = [];
  while (retries > 0) {
    const headersResult = await cdp.send('Runtime.evaluate', {
      expression: `
        Array.from(document.querySelectorAll('table thead th')).map(th => th.innerText.trim())
      `,
      returnByValue: true,
    });
    uiHeaders = headersResult.result?.value || [];
    if (uiHeaders.length > 0) break;
    await delay(1000);
    retries--;
  }
  console.log('  UI Table Headers:', uiHeaders);

  const expectedHeaders = ['Customer ID', 'Name', 'Product Name', 'Phone', 'CNIC', 'City', 'Added', 'Actions'];
  assert(
    uiHeaders.length === expectedHeaders.length &&
      expectedHeaders.every((h, i) => uiHeaders[i] === h),
    `UI Table Headers match exactly: [${expectedHeaders.join(', ')}]`
  );

  // Check Table Rows in UI
  const rowsResult = await cdp.send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return {
          id: tds[0]?.innerText.trim(),
          name: tds[1]?.innerText.trim(),
          product: tds[2]?.innerText.trim(),
          phone: tds[3]?.innerText.trim()
        };
      })
    `,
    returnByValue: true,
  });
  const uiRows = rowsResult.result?.value || [];
  console.log('  Sample UI Rows:', uiRows.slice(0, 5));

  const multiRow = uiRows.find((r) => r.id?.includes('CUST-00001'));
  assert(
    multiRow && multiRow.product.includes('mobile') && multiRow.product.includes('Honda CD 70'),
    `UI displays multiple product badges for CUST-00001: "${multiRow?.product}"`
  );

  const singleRow = uiRows.find((r) => r.id?.includes('CUST-00002'));
  assert(
    singleRow && singleRow.product === 'mobile',
    `UI displays single product for CUST-00002: "${singleRow?.product}"`
  );

  const zeroRow = uiRows.find((r) => r.id?.includes(noProdCust.customerId));
  assert(
    zeroRow && zeroRow.product === 'No Product',
    `UI displays "No Product" for customer without contract (${noProdCust.customerId}): "${zeroRow?.product}"`
  );

  // Test UI Search Box
  console.log('\n--- Testing UI Search Box in Online Mode ---');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const input = document.querySelector('input[placeholder*="Search"]');
      if (input) {
        input.value = 'ghani';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `,
  });
  await delay(1500);

  const searchNameRes = await cdp.send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return { id: tds[0]?.innerText.trim(), name: tds[1]?.innerText.trim(), product: tds[2]?.innerText.trim() };
      })
    `,
    returnByValue: true,
  });
  const searchNameRows = searchNameRes.result?.value || [];
  assert(
    searchNameRows.some((r) => r.name?.toLowerCase().includes('ghani') && r.product.includes('Honda CD 70')),
    'UI Search for "ghani" displays matching customer with products intact'
  );

  // Clear search
  await cdp.send('Runtime.evaluate', {
    expression: `
      const input = document.querySelector('input[placeholder*="Search"]');
      if (input) {
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `,
  });
  await delay(1500);

  // --- PHASE 5: Offline Mode & Offline Refresh (Ctrl + R) ---
  console.log('\n--- PHASE 5: Offline Mode & Offline Refresh (Ctrl + R) ---');

  // First sync to IndexedDB
  await cdp.send('Runtime.evaluate', {
    expression: `
      if (window.__IMS_SYNC_MANAGER__ && window.__IMS_SYNC_MANAGER__.bootstrapCache) {
        window.__IMS_SYNC_MANAGER__.bootstrapCache();
      }
    `,
  });
  await delay(1000);

  // Emulate Network Offline
  console.log('Simulating Network Offline...');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await delay(500);

  // Hard reload page in offline mode (simulation of Ctrl + R)
  console.log('Performing Page Reload in Offline Mode (Ctrl + R simulation)...');
  await cdp.send('Page.reload', { ignoreCache: true });
  await delay(2500);

  // Verify Offline indicators
  const offlineCheck = await cdp.send('Runtime.evaluate', {
    expression: `
      const badge = document.body.innerText.includes('Offline Cache');
      const tableHeaders = Array.from(document.querySelectorAll('table thead th')).map(th => th.innerText.trim());
      const rows = Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return {
          id: tds[0]?.innerText.trim(),
          name: tds[1]?.innerText.trim(),
          product: tds[2]?.innerText.trim()
        };
      });
      ({ badge, tableHeaders, rows })
    `,
    returnByValue: true,
  });
  const offlineData = offlineCheck.result?.value || {};
  console.log('  Offline Data Sample:', offlineData.rows?.slice(0, 4));

  assert(
    offlineData.tableHeaders?.length === 8 && offlineData.tableHeaders[2] === 'Product Name',
    'Offline Reload: Table header contains "Product Name" as 3rd column'
  );

  const offlineMultiRow = offlineData.rows?.find((r) => r.id?.includes('CUST-00001'));
  assert(
    offlineMultiRow && offlineMultiRow.product.includes('mobile') && offlineMultiRow.product.includes('Honda CD 70'),
    `Offline Reload: Multi-product customer retains products ("${offlineMultiRow?.product}")`
  );

  const offlineSingleRow = offlineData.rows?.find((r) => r.id?.includes('CUST-00002'));
  assert(
    offlineSingleRow && offlineSingleRow.product === 'mobile',
    `Offline Reload: Single product customer retains product ("${offlineSingleRow?.product}")`
  );

  const offlineZeroRow = offlineData.rows?.find((r) => r.id?.includes(noProdCust.customerId));
  assert(
    offlineZeroRow && offlineZeroRow.product === 'No Product',
    `Offline Reload: Zero product customer displays "No Product" ("${offlineZeroRow?.product}")`
  );

  // Test Offline Search
  console.log('\n--- Testing Search in Offline Mode ---');
  await cdp.send('Runtime.evaluate', {
    expression: `
      const input = document.querySelector('input[placeholder*="Search"]');
      if (input) {
        input.value = ${JSON.stringify(noProdCust.customerId)};
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    `,
  });
  await delay(1000);

  const offlineSearchCheck = await cdp.send('Runtime.evaluate', {
    expression: `
      Array.from(document.querySelectorAll('table tbody tr')).map(tr => {
        const tds = Array.from(tr.querySelectorAll('td'));
        return { id: tds[0]?.innerText.trim(), product: tds[2]?.innerText.trim() };
      })
    `,
    returnByValue: true,
  });
  const offlineSearchRows = offlineSearchCheck.result?.value || [];
  assert(
    offlineSearchRows.some((r) => r.id?.includes(noProdCust.customerId) && r.product === 'No Product'),
    `Offline Search for "${noProdCust.customerId}" finds customer with "No Product"`
  );

  // Restore Online
  console.log('\nRestoring Online Connection...');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await delay(500);

  // Close browser and cleanup
  cdp.close();
  try {
    chromeProc.kill();
  } catch {}

  // Clean up created test plan & customer
  if (createdMultiPlan) {
    await InstallmentPlan.findByIdAndDelete(createdMultiPlan._id);
    console.log('Cleaned up temporary test plan');
  }
  if (noProdCust) {
    await Customer.findByIdAndDelete(noProdCust._id);
    console.log('Cleaned up temporary test customer');
  }

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`CUSTOMERS PRODUCT NAME TEST RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed with unhandled error:', err);
  process.exit(1);
});
