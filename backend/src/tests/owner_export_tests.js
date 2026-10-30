const mongoose = require('mongoose');
const zlib = require('zlib');
const {
  summaryPdf,
  transactionsPdf,
  fundedCustomersPdf,
  fundedContractsPdf,
  outstandingPdf,
  summaryExcel,
  transactionsExcel,
  fundedCustomersExcel,
  fundedContractsExcel,
} = require('../controllers/ownerExportController');

// Extracts text from decompressed PDF streams (supporting PDFKit hex kerning TJ arrays)
function pdfContainsText(pdfBuffer, expectedText) {
  const raw = pdfBuffer.toString('binary');
  if (raw.includes(expectedText)) return true;

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
      if (decompressed.includes(expectedText)) return true;

      // Extract hex strings inside TJ operators e.g. [<4465> ... <...>] TJ
      const tjMatches = decompressed.match(/\[([\s\S]*?)\]\s*TJ/g);
      if (tjMatches) {
        for (const tj of tjMatches) {
          const hexParts = [];
          const hexRegex = /<([0-9a-fA-F]+)>/g;
          let h;
          while ((h = hexRegex.exec(tj)) !== null) {
            hexParts.push(h[1]);
          }
          if (hexParts.length > 0) {
            const combinedHex = hexParts.join('');
            const decoded = Buffer.from(combinedHex, 'hex').toString('utf8');
            if (decoded.includes(expectedText)) return true;
          }
        }
      }
    } catch (e) {
      // not a deflate stream
    }

    searchIdx = streamEnd + 9;
  }
  return false;
}

// Mock Express response that captures headers and chunks
function createMockRes() {
  const headers = {};
  const chunks = [];
  let statusCode = 200;
  let finished = false;

  const res = {
    statusCode,
    headers,
    setHeader(key, val) {
      headers[key.toLowerCase()] = val;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    write(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      finished = true;
      if (this.onFinish) this.onFinish(Buffer.concat(chunks));
    },
    on(event, handler) {
      if (event === 'finish' && finished) handler();
    },
    once(event, handler) {
      if (event === 'finish' && finished) handler();
    },
    emit() {},
  };
  return { res, getBuffer: () => Buffer.concat(chunks), getHeaders: () => headers };
}

async function run() {
  await mongoose.connect('mongodb://127.0.0.1:27017/installment_management3');
  console.log('Connected to DB for Owner Export Tests');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}:`, err.message);
      failed++;
    }
  }

  const expectedFooter = 'Software Development by SHOUKAT | 03348004300';

  await test('summaryPdf generates valid PDF with developer footer', async () => {
    const { res } = createMockRes();
    await new Promise((resolve, reject) => {
      res.onFinish = (buf) => {
        try {
          if (!buf || buf.length < 100) throw new Error('PDF buffer empty or too small');
          const pdfHeader = buf.subarray(0, 5).toString('ascii');
          if (pdfHeader !== '%PDF-') throw new Error('Not a valid PDF header');
          if (!pdfContainsText(buf, expectedFooter)) {
            throw new Error(`Footer "${expectedFooter}" not found in PDF streams`);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      summaryPdf({}, res, reject);
    });
  });

  await test('transactionsPdf generates valid PDF with developer footer', async () => {
    const { res } = createMockRes();
    await new Promise((resolve, reject) => {
      res.onFinish = (buf) => {
        try {
          if (!buf || buf.length < 100) throw new Error('PDF buffer empty');
          if (!pdfContainsText(buf, expectedFooter)) {
            throw new Error(`Footer "${expectedFooter}" not found in PDF streams`);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      transactionsPdf({}, res, reject);
    });
  });

  await test('fundedCustomersPdf generates valid PDF with developer footer', async () => {
    const { res } = createMockRes();
    await new Promise((resolve, reject) => {
      res.onFinish = (buf) => {
        try {
          if (!buf || buf.length < 100) throw new Error('PDF buffer empty');
          if (!pdfContainsText(buf, expectedFooter)) {
            throw new Error(`Footer "${expectedFooter}" not found in PDF streams`);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      fundedCustomersPdf({}, res, reject);
    });
  });

  await test('fundedContractsPdf generates valid PDF with developer footer', async () => {
    const { res } = createMockRes();
    await new Promise((resolve, reject) => {
      res.onFinish = (buf) => {
        try {
          if (!buf || buf.length < 100) throw new Error('PDF buffer empty');
          if (!pdfContainsText(buf, expectedFooter)) {
            throw new Error(`Footer "${expectedFooter}" not found in PDF streams`);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      fundedContractsPdf({}, res, reject);
    });
  });

  await test('outstandingPdf generates valid PDF with developer footer', async () => {
    const { res } = createMockRes();
    await new Promise((resolve, reject) => {
      res.onFinish = (buf) => {
        try {
          if (!buf || buf.length < 100) throw new Error('PDF buffer empty');
          if (!pdfContainsText(buf, expectedFooter)) {
            throw new Error(`Footer "${expectedFooter}" not found in PDF streams`);
          }
          resolve();
        } catch (e) {
          reject(e);
        }
      };
      outstandingPdf({}, res, reject);
    });
  });

  await test('summaryExcel produces valid XLSX output', async () => {
    const { res, getBuffer, getHeaders } = createMockRes();
    await summaryExcel({}, res, (err) => { if (err) throw err; });
    const buf = getBuffer();
    if (!buf || buf.length < 100) throw new Error('Excel buffer empty');
    const headers = getHeaders();
    if (!headers['content-disposition']?.includes('owner-summary.xlsx')) {
      throw new Error(`Unexpected disposition: ${headers['content-disposition']}`);
    }
  });

  await test('transactionsExcel produces valid XLSX output', async () => {
    const { res, getBuffer, getHeaders } = createMockRes();
    await transactionsExcel({}, res, (err) => { if (err) throw err; });
    const buf = getBuffer();
    if (!buf || buf.length < 100) throw new Error('Excel buffer empty');
    const headers = getHeaders();
    if (!headers['content-disposition']?.includes('owner-transactions.xlsx')) {
      throw new Error(`Unexpected disposition: ${headers['content-disposition']}`);
    }
  });

  await test('fundedCustomersExcel produces valid XLSX output', async () => {
    const { res, getBuffer, getHeaders } = createMockRes();
    await fundedCustomersExcel({}, res, (err) => { if (err) throw err; });
    const buf = getBuffer();
    if (!buf || buf.length < 100) throw new Error('Excel buffer empty');
    const headers = getHeaders();
    if (!headers['content-disposition']?.includes('owner-funded-customers.xlsx')) {
      throw new Error(`Unexpected disposition: ${headers['content-disposition']}`);
    }
  });

  await test('fundedContractsExcel produces valid XLSX output', async () => {
    const { res, getBuffer, getHeaders } = createMockRes();
    await fundedContractsExcel({}, res, (err) => { if (err) throw err; });
    const buf = getBuffer();
    if (!buf || buf.length < 100) throw new Error('Excel buffer empty');
    const headers = getHeaders();
    if (!headers['content-disposition']?.includes('owner-funded-contracts.xlsx')) {
      throw new Error(`Unexpected disposition: ${headers['content-disposition']}`);
    }
  });

  console.log(`\nOwner Export Tests: ${passed} passed, ${failed} failed`);
  await mongoose.disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
