const { PassThrough } = require('stream');
const { startPdf, drawHeader, drawTable, finalizePdf } = require('../utils/pdfGenerator');

function generatePdfBuffer({ rowCount }) {
  return new Promise((resolve) => {
    const stream = new PassThrough();
    stream.setHeader = () => {};
    const chunks = [];
    stream.on('data', (c) => chunks.push(c));
    stream.on('end', () => {
      const buf = Buffer.concat(chunks);
      const text = buf.toString('latin1');
      const match = text.match(/\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/);
      const pageCount = match ? parseInt(match[1], 10) : 1;
      resolve({ buf, pageCount });
    });

    const doc = startPdf(stream, 'test.pdf');
    drawHeader(doc, { businessName: 'Test Business' }, 'PAGINATION TEST REPORT');

    const columns = [
      { header: 'ID', key: 'id', width: 60 },
      { header: 'Name', key: 'name', width: 150 },
      { header: 'Amount', key: 'amount', width: 100, align: 'right' },
      { header: 'Status', key: 'status', width: 100 },
    ];
    const rows = [];
    for (let i = 1; i <= rowCount; i++) {
      rows.push({ id: `#${i}`, name: `Customer Record ${i}`, amount: `PKR ${i * 1000}`, status: 'ACTIVE' });
    }
    drawTable(doc, columns, rows);
    finalizePdf(doc);
  });
}

async function run() {
  console.log('--- Running PDF Pagination & Ghost Page Elimination Tests ---');
  let passed = 0;
  let failed = 0;

  function assert(name, condition) {
    if (condition) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ ${name}`);
      failed++;
    }
  }

  // Test 1: Short 1-page report (5 rows) -> must be exactly 1 page
  const t1 = await generatePdfBuffer({ rowCount: 5 });
  assert('Short report: exactly 1 page (no ghost page 2)', t1.pageCount === 1);

  // Test 2: 20 rows -> still fits on exactly 1 page
  const t2 = await generatePdfBuffer({ rowCount: 20 });
  assert('20 rows report: fits on exactly 1 page', t2.pageCount === 1);

  // Test 3: Multi-page report (60 rows) -> exactly 2 pages
  const t3 = await generatePdfBuffer({ rowCount: 60 });
  assert('60 rows: exactly 2 pages (no extra 3rd page)', t3.pageCount === 2);

  // Test 4: Large report (120 rows) -> exactly 4 pages
  const t4 = await generatePdfBuffer({ rowCount: 120 });
  assert('120 rows: exactly 4 pages (no extra 5th page)', t4.pageCount === 4);

  console.log(`\nPDF Pagination Tests: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
