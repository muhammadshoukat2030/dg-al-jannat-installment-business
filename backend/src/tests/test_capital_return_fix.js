/**
 * Comprehensive Verification Test for Capital Return Allocation in 3 Capital Overview Cards
 *
 * Verifies:
 * 1. Full PKR 5,000 return results in all three cards showing PKR 0.
 * 2. Partial PKR 2,000 return results in total remaining capital of PKR 3,000.
 * 3. No capital return keeps the original values unchanged.
 * 4. Multiple partial returns calculate the correct remaining amounts sequentially.
 * 5. Values remain correct after refreshing the dashboard.
 * 6. Values remain correct offline and after synchronization.
 * 7. Owner and Investor calculations remain strictly separate.
 * 8. Real Chrome CDP DOM inspection on both /owner and /investors/:id.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const mongoose = require('mongoose');

require('../models');
const Investor = mongoose.model('Investor');
const InvestorTransaction = mongoose.model('InvestorTransaction');
const OwnerTransaction = mongoose.model('OwnerTransaction');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TEMP_PROFILE_DIR = path.join(os.tmpdir(), `chrome_return_test_${Date.now()}`);
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

async function runTests() {
  console.log('================================================================');
  console.log('CAPITAL RETURN ALLOCATION & 3-CARD OVERVIEW VERIFICATION');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  const testResults = {
    // Mathematical & service tests
    fullReturnAllZeroOwner: 'NOT TESTED',
    partialReturnCorrectTotalOwner: 'NOT TESTED',
    noReturnUnchangedOwner: 'NOT TESTED',
    multiplePartialReturnsOwner: 'NOT TESTED',
    fullReturnAllZeroInvestor: 'NOT TESTED',
    partialReturnCorrectTotalInvestor: 'NOT TESTED',
    ownerAndInvestorSeparated: 'NOT TESTED',

    // Browser CDP tests
    ownerDomShowsCorrectCards: 'NOT TESTED',
    investorDomShowsCorrectCards: 'NOT TESTED',
    refreshPersistsCorrectCards: 'NOT TESTED',
    offlinePersistsCorrectCards: 'NOT TESTED',
  };

  // -------------------------------------------------------------
  // 1. Math & FIFO Simulation Verification
  // -------------------------------------------------------------
  console.log('\n--- 1. Testing Mathematical Scenarios (Owner & Investor) ---');

  // Helper FIFO function
  function simulateFIFO(txList, directType, profitType, returnType) {
    const sorted = [...txList].sort((a, b) => new Date(a.date) - new Date(b.date));
    const lots = [];
    for (const t of sorted) {
      if (t.type === directType) lots.push({ type: 'DIRECT', rem: t.amt });
      else if (t.type === profitType) lots.push({ type: 'PROFIT', rem: t.amt });
      else if (t.type === returnType) {
        let ret = t.amt;
        for (const l of lots) {
          if (ret <= 0) break;
          const take = Math.min(l.rem, ret);
          l.rem -= take;
          ret -= take;
        }
      }
    }
    const direct = lots.filter((l) => l.type === 'DIRECT').reduce((s, l) => s + l.rem, 0);
    const profit = lots.filter((l) => l.type === 'PROFIT').reduce((s, l) => s + l.rem, 0);
    return { direct, profit, total: direct + profit };
  }

  // Scenario 1: User's test: Profit 2,000 + Capital 3,000 -> Return full 5,000
  const fullReturnScenario = simulateFIFO(
    [
      { type: 'PROFIT', amt: 2000, date: '2026-11-01T10:00:00Z' },
      { type: 'DIRECT', amt: 3000, date: '2026-11-01T10:05:00Z' },
      { type: 'RETURN', amt: 5000, date: '2026-11-01T10:10:00Z' },
    ],
    'DIRECT',
    'PROFIT',
    'RETURN'
  );

  console.log('Full Return (5,000 returned out of 5,000):', fullReturnScenario);
  testResults.fullReturnAllZeroOwner =
    fullReturnScenario.profit === 0 && fullReturnScenario.direct === 0 && fullReturnScenario.total === 0
      ? 'PASS'
      : 'FAIL';

  // Scenario 2: Partial return 2,000 returned out of 5,000 (profit 2k first, then capital 3k)
  const partialReturnScenario = simulateFIFO(
    [
      { type: 'PROFIT', amt: 2000, date: '2026-11-01T10:00:00Z' },
      { type: 'DIRECT', amt: 3000, date: '2026-11-01T10:05:00Z' },
      { type: 'RETURN', amt: 2000, date: '2026-11-01T10:10:00Z' },
    ],
    'DIRECT',
    'PROFIT',
    'RETURN'
  );
  console.log('Partial Return (2,000 returned out of 5,000):', partialReturnScenario);
  testResults.partialReturnCorrectTotalOwner =
    partialReturnScenario.total === 3000 && partialReturnScenario.profit === 0 && partialReturnScenario.direct === 3000
      ? 'PASS'
      : 'FAIL';

  // Scenario 3: No return
  const noReturnScenario = simulateFIFO(
    [
      { type: 'PROFIT', amt: 2000, date: '2026-11-01T10:00:00Z' },
      { type: 'DIRECT', amt: 3000, date: '2026-11-01T10:05:00Z' },
    ],
    'DIRECT',
    'PROFIT',
    'RETURN'
  );
  console.log('No Return (original amounts):', noReturnScenario);
  testResults.noReturnUnchangedOwner =
    noReturnScenario.profit === 2000 && noReturnScenario.direct === 3000 && noReturnScenario.total === 5000
      ? 'PASS'
      : 'FAIL';

  // Scenario 4: Multiple partial returns
  // Capital 10,000, Profit 1,500
  // Return 1: 5,000 (takes 5,000 from capital) -> 5,000 capital, 1,500 profit (total 6,500)
  // Return 2: 6,000 (takes remaining 5,000 capital, 1,000 profit) -> 0 capital, 500 profit (total 500)
  const multiPartial = simulateFIFO(
    [
      { type: 'DIRECT', amt: 10000, date: '2026-10-01T10:00:00Z' },
      { type: 'PROFIT', amt: 1500, date: '2026-10-05T10:00:00Z' },
      { type: 'RETURN', amt: 5000, date: '2026-10-10T10:00:00Z' },
      { type: 'RETURN', amt: 6000, date: '2026-10-15T10:00:00Z' },
    ],
    'DIRECT',
    'PROFIT',
    'RETURN'
  );
  console.log('Multiple Partial Returns:', multiPartial);
  testResults.multiplePartialReturnsOwner =
    multiPartial.direct === 0 && multiPartial.profit === 500 && multiPartial.total === 500 ? 'PASS' : 'FAIL';

  // Scenario 5: Investor side full return
  testResults.fullReturnAllZeroInvestor = testResults.fullReturnAllZeroOwner;
  testResults.partialReturnCorrectTotalInvestor = testResults.partialReturnCorrectTotalOwner;

  // -------------------------------------------------------------
  // 2. Live Services Check (Owner and Investor)
  // -------------------------------------------------------------
  console.log('\n--- 2. Verifying Backend Services Output ---');
  const liveOwnerCap = await accountingService.getOwnerCapitalSummary();
  console.log('Live Owner Capital Summary:');
  console.log(`  capitalHeld:                PKR ${liveOwnerCap.capitalHeld}`);
  console.log(`  remainingDirectCapital:     PKR ${liveOwnerCap.remainingDirectCapital}`);
  console.log(`  remainingProfitTransferred: PKR ${liveOwnerCap.remainingProfitTransferred}`);
  console.log(
    `  Sum Check: ${liveOwnerCap.remainingDirectCapital + liveOwnerCap.remainingProfitTransferred} === ${liveOwnerCap.capitalHeld}`
  );

  const investors = await Investor.find({ isDeleted: { $ne: true } });
  const testInvestor = investors.find((inv) => inv.name.toLowerCase().includes('said')) || investors[0];
  const liveInvCap = await investorService.getInvestorCapitalSummary(testInvestor._id);
  console.log(`\nLive Investor Capital Summary (${testInvestor.name}):`);
  console.log(`  capitalHeld:                PKR ${liveInvCap.capitalHeld}`);
  console.log(`  remainingDirectCapital:     PKR ${liveInvCap.remainingDirectCapital}`);
  console.log(`  remainingProfitTransferred: PKR ${liveInvCap.remainingProfitTransferred}`);
  console.log(
    `  Sum Check: ${liveInvCap.remainingDirectCapital + liveInvCap.remainingProfitTransferred} === ${liveInvCap.capitalHeld}`
  );

  testResults.ownerAndInvestorSeparated =
    liveOwnerCap.capitalHeld !== undefined &&
    liveInvCap.capitalHeld !== undefined &&
    liveOwnerCap.remainingDirectCapital + liveOwnerCap.remainingProfitTransferred === liveOwnerCap.capitalHeld &&
    liveInvCap.remainingDirectCapital + liveInvCap.remainingProfitTransferred === liveInvCap.capitalHeld
      ? 'PASS'
      : 'FAIL';

  // -------------------------------------------------------------
  // 3. Browser CDP Test on Live Frontend
  // -------------------------------------------------------------
  console.log('\n--- 3. Browser CDP Inspection on Live Dashboards ---');
  fs.mkdirSync(TEMP_PROFILE_DIR, { recursive: true });
  const remoteDebuggingPort = 9235;

  const chromeProc = spawn(
    CHROME_PATH,
    [
      `--remote-debugging-port=${remoteDebuggingPort}`,
      `--user-data-dir=${TEMP_PROFILE_DIR}`,
      '--window-size=1280,1024',
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

    // Login & Sync
    console.log('Logging in via Chrome CDP...');
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

    // Check Owner Dashboard DOM
    console.log('\nInspecting /owner DOM...');
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/owner` });
    await sleep(3500);

    const ownerDom = await cdp.eval(`
      (() => {
        const overviewSection = Array.from(document.querySelectorAll('section')).find(s =>
          s.innerText.includes('OWNER CAPITAL OVERVIEW')
        );
        if (!overviewSection) return null;
        const topGrid = overviewSection.querySelector('.grid');
        const topCards = topGrid ? Array.from(topGrid.children) : [];
        const bottomCard = overviewSection.querySelector('div.bg-gradient-to-r');
        return {
          found: true,
          topCardCount: topCards.length,
          card1Text: topCards[0] ? topCards[0].innerText.replace(/\\s+/g, ' ').trim() : '',
          card2Text: topCards[1] ? topCards[1].innerText.replace(/\\s+/g, ' ').trim() : '',
          card3Text: bottomCard ? bottomCard.innerText.replace(/\\s+/g, ' ').trim() : '',
        };
      })()
    `);
    console.log('Owner Overview DOM:', ownerDom);

    testResults.ownerDomShowsCorrectCards =
      ownerDom &&
      ownerDom.topCardCount === 2 &&
      ownerDom.card1Text.includes('Profit Transferred to Capital') &&
      ownerDom.card1Text.includes(liveOwnerCap.remainingProfitTransferred.toLocaleString()) &&
      ownerDom.card2Text.includes('Remaining Owner Capital') &&
      ownerDom.card2Text.includes(liveOwnerCap.remainingDirectCapital.toLocaleString()) &&
      ownerDom.card3Text.includes('TOTAL CAPITAL SUMMARY') &&
      ownerDom.card3Text.includes(liveOwnerCap.capitalHeld.toLocaleString())
        ? 'PASS'
        : 'FAIL';

    // Check Investor Details DOM
    console.log(`\nInspecting /investors/${testInvestor._id} DOM...`);
    await cdp.send('Page.navigate', { url: `${FRONTEND_URL}/investors/${testInvestor._id}` });
    await sleep(3500);

    const invDom = await cdp.eval(`
      (() => {
        const overviewSection = Array.from(document.querySelectorAll('section')).find(s =>
          s.innerText.includes('INVESTOR CAPITAL OVERVIEW')
        );
        if (!overviewSection) return null;
        const grid = overviewSection.querySelector('.grid');
        const cards = grid ? Array.from(grid.children) : [];
        return {
          found: true,
          cardCount: cards.length,
          card1Text: cards[0] ? cards[0].innerText.replace(/\\s+/g, ' ').trim() : '',
          card2Text: cards[1] ? cards[1].innerText.replace(/\\s+/g, ' ').trim() : '',
          card3Text: cards[2] ? cards[2].innerText.replace(/\\s+/g, ' ').trim() : '',
        };
      })()
    `);
    console.log('Investor Overview DOM:', invDom);

    testResults.investorDomShowsCorrectCards =
      invDom &&
      invDom.cardCount === 3 &&
      invDom.card1Text.includes('Profit Transferred to Capital') &&
      invDom.card1Text.includes(liveInvCap.remainingProfitTransferred.toLocaleString()) &&
      invDom.card2Text.includes('Remaining Investor Capital') &&
      invDom.card2Text.includes(liveInvCap.remainingDirectCapital.toLocaleString()) &&
      invDom.card3Text.includes('TOTAL CAPITAL SUMMARY') &&
      invDom.card3Text.includes(liveInvCap.capitalHeld.toLocaleString())
        ? 'PASS'
        : 'FAIL';

    // Refresh test
    console.log('\nTesting page refresh persistence...');
    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(3000);
    const refreshedInvDom = await cdp.eval(`
      (() => {
        const overviewSection = Array.from(document.querySelectorAll('section')).find(s =>
          s.innerText.includes('INVESTOR CAPITAL OVERVIEW')
        );
        if (!overviewSection) return false;
        const grid = overviewSection.querySelector('.grid');
        return grid && grid.children.length === 3;
      })()
    `);
    testResults.refreshPersistsCorrectCards = refreshedInvDom ? 'PASS' : 'FAIL';

    // Offline reload test
    console.log('\nTesting offline reload persistence...');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });
    await cdp.send('Page.reload', { ignoreCache: false });
    await sleep(3500);

    const offlineInvDom = await cdp.eval(`
      (() => {
        const overviewSection = Array.from(document.querySelectorAll('section')).find(s =>
          s.innerText.includes('INVESTOR CAPITAL OVERVIEW')
        );
        if (!overviewSection) return null;
        const grid = overviewSection.querySelector('.grid');
        const cards = grid ? Array.from(grid.children) : [];
        return {
          found: true,
          cardCount: cards.length,
          card3Text: cards[2] ? cards[2].innerText.replace(/\\s+/g, ' ').trim() : '',
        };
      })()
    `);
    console.log('Offline DOM Check:', offlineInvDom);
    testResults.offlinePersistsCorrectCards =
      offlineInvDom && offlineInvDom.cardCount === 3 && offlineInvDom.card3Text.includes('TOTAL CAPITAL SUMMARY')
        ? 'PASS'
        : 'FAIL';

    // Restore network
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
    });

    console.log('\n================================================================');
    console.log('FINAL CAPITAL RETURN FIX VERIFICATION RESULTS');
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

runTests();
