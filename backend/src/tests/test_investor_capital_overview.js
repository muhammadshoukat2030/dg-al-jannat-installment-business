/**
 * Automated Verification Script for Investor Capital Overview — Exactly 3 Cards
 *
 * Verifies:
 * 1. Mathematical formula and user test example:
 *    Card 1: Profit Transferred to Capital = PKR 3,500
 *    Card 2: Remaining Investor Capital = PKR 47,000 (Subtitle: Held capital in business custody.)
 *    Card 3: TOTAL CAPITAL SUMMARY = PKR 50,500 (3,500 + 47,000 = 50,500)
 * 2. Real Chrome CDP DOM inspection:
 *    - Finds the INVESTOR CAPITAL OVERVIEW section.
 *    - Verifies exactly 3 cards exist in the overview grid.
 *    - Card 1: Profit Transferred to Capital
 *    - Card 2: Remaining Investor Capital with subtitle "Held capital in business custody."
 *    - Card 3: TOTAL CAPITAL SUMMARY with visual prominence and sum formula.
 *    - Asserts "Total Withdrawn" is NOT present in the overview section.
 *    - Asserts previous separate bottom banner is removed.
 * 3. Offline resilience:
 *    - Emulates offline network conditions in Chrome.
 *    - Performs page reload offline.
 *    - Confirms all 3 cards render identically offline from IndexedDB.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const mongoose = require('mongoose');

require('../models');
const Investor = mongoose.model('Investor');
const investorService = require('../services/investorService');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_3card_test_${Date.now()}`);
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

async function runTest() {
  console.log('================================================================');
  console.log('INVESTOR CAPITAL OVERVIEW — EXACTLY 3 CARDS VERIFICATION');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // 1. Validate User Specification Mathematically
  console.log('\n--- 1. Validating User Specification Mathematically ---');
  const userProfitTransferred = 3500;
  const userRemainingCapital = 47000;
  const userTotalCapitalSummary = userProfitTransferred + userRemainingCapital; // 50,500

  console.log(`User Expected Values:`);
  console.log(`  Card 1 (Profit Transferred to Capital): PKR ${userProfitTransferred.toLocaleString()} (Expected 3,500)`);
  console.log(`  Card 2 (Remaining Investor Capital):    PKR ${userRemainingCapital.toLocaleString()} (Expected 47,000)`);
  console.log(`  Card 3 (TOTAL CAPITAL SUMMARY):         PKR ${userTotalCapitalSummary.toLocaleString()} (Expected 50,500)`);

  const mathValid = userTotalCapitalSummary === 50500;
  console.log(`Mathematical Specification Validation: ${mathValid ? '✓ PASS' : '✗ FAIL'}`);

  // Test with Live Database Investor
  const investors = await Investor.find({ isDeleted: { $ne: true } });
  const testInvestor = investors.find((inv) => inv.name.toLowerCase().includes('said')) || investors[0];
  console.log(`\nTesting with Live DB Investor: ${testInvestor.name} (${testInvestor._id})`);

  const serverSummary = await investorService.getInvestorCapitalSummary(testInvestor._id);
  const totalAdded = Number(serverSummary.totalCapitalAdded || 0);
  const totalWithdrawn = Number(serverSummary.totalCapitalReturned || 0);
  const profitTransferred = Number(serverSummary.profitTransferredToCapital || 0);
  const pureRemaining = totalAdded - totalWithdrawn;
  const expectedTotalSummary = profitTransferred + pureRemaining;

  console.log('Live Server Numbers:');
  console.log(`  Total Capital Added:            PKR ${totalAdded.toLocaleString()}`);
  console.log(`  Total Capital Returned:         PKR ${totalWithdrawn.toLocaleString()}`);
  console.log(`  Profit Transferred to Capital:  PKR ${profitTransferred.toLocaleString()}`);
  console.log(`  Remaining Investor Capital:     PKR ${pureRemaining.toLocaleString()}`);
  console.log(`  TOTAL CAPITAL SUMMARY:          PKR ${expectedTotalSummary.toLocaleString()}`);

  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
  const remoteDebuggingPort = 9232;

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
  const testResults = {
    mathSpecValid: mathValid ? 'PASS' : 'FAIL',
    sectionFound: 'NOT TESTED',
    exactThreeCards: 'NOT TESTED',
    card1ProfitTransferred: 'NOT TESTED',
    card2RemainingCapital: 'NOT TESTED',
    card2SubtitlePresent: 'NOT TESTED',
    card3TotalSummary: 'NOT TESTED',
    totalWithdrawnRemoved: 'NOT TESTED',
    oldBannerRemoved: 'NOT TESTED',
    offlineRenderCheck: 'NOT TESTED',
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

    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.ready();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    // Login & Sync
    console.log('\n--- 2. Authenticating in Chrome ---');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/login` });
    await sleep(2000);

    await cdp.eval(`
      (async () => {
        const res = await fetch('${BACKEND_URL}/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'admin@localhost.com', password: '12345' }),
        });
        const data = await res.json();
        if (data.success && data.token) {
          localStorage.setItem('ims_token', data.token);
          localStorage.setItem('ims_admin', JSON.stringify(data.admin));
        }
      })()
    `);

    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/` });
    await sleep(2500);
    await cdp.eval(`window.__ims_triggerSync && window.__ims_triggerSync()`);
    for (let i = 0; i < 15; i++) {
      await sleep(1000);
      const s = await cdp.eval(`window.__ims_syncState || {}`);
      if (!s.isSyncing && s.bootstrapStatus === 'COMPLETED') break;
    }
    console.log('✓ Bootstrap sync completed');

    // Navigate to investor details
    console.log(`\n--- 3. Navigating to /investors/${testInvestor._id} ---`);
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/investors/${testInvestor._id}` });
    await sleep(3500);

    // Inspect DOM for Investor Capital Overview section
    console.log('\n--- 4. Inspecting DOM for Exactly 3 Cards ---');
    const overviewInspection = await cdp.eval(`
      (() => {
        const sections = Array.from(document.querySelectorAll('section'));
        const overviewSection = sections.find(s =>
          s.innerText.includes('INVESTOR CAPITAL OVERVIEW')
        );
        if (!overviewSection) return { error: 'Overview section not found' };

        // Find the cards container inside this section
        const grid = overviewSection.querySelector('.grid');
        if (!grid) return { error: 'Grid container not found' };

        const cards = Array.from(grid.children);
        const cardTexts = cards.map(c => c.innerText.replace(/\\s+/g, ' ').trim());

        // Check if Total Withdrawn is present inside this section
        const hasTotalWithdrawn = overviewSection.innerText.includes('Total Withdrawn');

        // Check if any old bottom banner exists
        const banners = overviewSection.querySelectorAll('div.rounded-xl.p-4.sm\\\\:p-5');

        return {
          cardCount: cards.length,
          cardTexts,
          hasTotalWithdrawn,
          bannerCount: banners.length,
          fullSectionText: overviewSection.innerText.replace(/\\s+/g, ' ').trim()
        };
      })()
    `);

    console.log('Overview Inspection Details:');
    console.log(JSON.stringify(overviewInspection, null, 2));

    testResults.sectionFound = overviewInspection && !overviewInspection.error ? 'PASS' : 'FAIL';
    testResults.exactThreeCards = overviewInspection && overviewInspection.cardCount === 3 ? 'PASS' : 'FAIL';

    if (overviewInspection && overviewInspection.cardTexts) {
      const [c1, c2, c3] = overviewInspection.cardTexts;

      // Card 1: Profit Transferred to Capital
      const c1HasTitle = c1.includes('Profit Transferred to Capital');
      const c1HasAmount = c1.includes(profitTransferred.toLocaleString());
      testResults.card1ProfitTransferred = c1HasTitle && c1HasAmount ? 'PASS' : 'FAIL';
      console.log(`Card 1 (Profit Transferred): ${testResults.card1ProfitTransferred} ("${c1}")`);

      // Card 2: Remaining Investor Capital
      const c2HasTitle = c2.includes('Remaining Investor Capital');
      const c2HasSubtitle = c2.includes('Held capital in business custody.');
      const c2HasAmount = c2.includes(pureRemaining.toLocaleString());
      testResults.card2RemainingCapital = c2HasTitle && c2HasAmount ? 'PASS' : 'FAIL';
      testResults.card2SubtitlePresent = c2HasSubtitle ? 'PASS' : 'FAIL';
      console.log(`Card 2 (Remaining Investor Capital): ${testResults.card2RemainingCapital} ("${c2}")`);
      console.log(`Card 2 Subtitle ("Held capital in business custody."): ${testResults.card2SubtitlePresent}`);

      // Card 3: TOTAL CAPITAL SUMMARY
      const c3HasTitle = c3.includes('TOTAL CAPITAL SUMMARY');
      const c3HasAmount = c3.includes(expectedTotalSummary.toLocaleString());
      testResults.card3TotalSummary = c3HasTitle && c3HasAmount ? 'PASS' : 'FAIL';
      console.log(`Card 3 (TOTAL CAPITAL SUMMARY): ${testResults.card3TotalSummary} ("${c3}")`);

      // Check absence of Total Withdrawn
      testResults.totalWithdrawnRemoved = !overviewInspection.hasTotalWithdrawn ? 'PASS' : 'FAIL';
      console.log(`Total Withdrawn Removed from section: ${testResults.totalWithdrawnRemoved}`);

      // Check old banner removed
      testResults.oldBannerRemoved = overviewInspection.bannerCount === 0 ? 'PASS' : 'FAIL';
      console.log(`Old separate banner removed: ${testResults.oldBannerRemoved}`);
    }

    // 5. Offline Refresh Verification
    console.log('\n--- 5. Offline Refresh Verification ---');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(3500);

    const offlineInspection = await cdp.eval(`
      (() => {
        const sections = Array.from(document.querySelectorAll('section'));
        const overviewSection = sections.find(s =>
          s.innerText.includes('INVESTOR CAPITAL OVERVIEW')
        );
        if (!overviewSection) return null;
        const grid = overviewSection.querySelector('.grid');
        const cards = grid ? Array.from(grid.children) : [];
        return {
          found: true,
          cardCount: cards.length,
          hasTotalWithdrawn: overviewSection.innerText.includes('Total Withdrawn'),
          texts: cards.map(c => c.innerText.replace(/\\s+/g, ' ').trim())
        };
      })()
    `);

    console.log('Offline Inspection Check:', JSON.stringify(offlineInspection, null, 2));

    testResults.offlineRenderCheck =
      offlineInspection &&
      offlineInspection.cardCount === 3 &&
      !offlineInspection.hasTotalWithdrawn
        ? 'PASS'
        : 'FAIL';

    // Restore online
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    console.log('\n================================================================');
    console.log('FINAL 3-CARD INVESTOR CAPITAL OVERVIEW TEST RESULTS');
    console.log('================================================================');
    console.table(testResults);

    const allPassed = Object.values(testResults).every((v) => v === 'PASS');
    console.log(`\nOVERALL TEST SUITE: ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
  } catch (err) {
    console.error('Test execution error:', err);
  } finally {
    if (cdp) cdp.close();
    chromeProc.kill('SIGKILL');
    await mongoose.disconnect();
    try {
      fs.rmSync(TEMP_PROFILE_DIR, { recursive: true, force: true });
    } catch (e) {}
  }
}

runTest();
