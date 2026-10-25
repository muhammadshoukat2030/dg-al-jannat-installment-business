const PDFDocument = require('pdfkit');
const { formatCurrency, formatDate, formatDateTime } = require('./formatHelpers');

// Fixed developer branding — per explicit requirement this text is permanent,
// never settings-derived, and never editable/removable by the Owner/Admin.
const DEVELOPER_FOOTER_TEXT = 'Developed by SHOUKAT | 03348004300';

/**
 * Create a new PDF document, pipe it to the response, and return the doc.
 * bufferPages is enabled so finalizePdf() can walk every page and stamp a
 * footer on each one (PDFKit doesn't do this automatically).
 * Caller must call finalizePdf(doc) instead of doc.end() directly.
 */
function startPdf(res, filename) {
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
  return doc;
}

/**
 * Draws the business/owner header using only whatever fields are actually
 * filled in on the Settings page. Nothing here is hard-coded.
 */
function drawHeader(doc, settings, title) {
  doc.fontSize(16).font('Helvetica-Bold').text(settings.businessName || 'Installment Business', { align: 'center' });

  if (settings.ownerName) {
    doc.fontSize(9).font('Helvetica').fillColor('#444').text(settings.ownerName, { align: 'center' });
  }

  const contactBits = [];
  if (settings.phone1) contactBits.push(settings.phone1);
  if (settings.phone2) contactBits.push(settings.phone2);
  if (settings.whatsapp) contactBits.push(`WhatsApp: ${settings.whatsapp}`);
  if (contactBits.length) {
    doc.fontSize(9).font('Helvetica').fillColor('#444').text(contactBits.join('  |  '), { align: 'center' });
  }

  const secondaryBits = [];
  if (settings.email) secondaryBits.push(settings.email);
  if (settings.website) secondaryBits.push(settings.website);
  if (secondaryBits.length) {
    doc.fontSize(9).text(secondaryBits.join('  |  '), { align: 'center' });
  }

  if (settings.address) {
    doc.fontSize(9).text(settings.address, { align: 'center' });
  }

  doc.fillColor('#000');
  doc.moveDown(0.6);
  doc.fontSize(13).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica').fillColor('#666').text(`Printed On: ${formatDateTime(new Date())}`, { align: 'center' });
  doc.fillColor('#000');
  doc.moveDown(1);
}

/**
 * Stamps the fixed developer branding footer on every buffered page, then
 * finalizes and ends the PDF stream. Always call this instead of doc.end().
 * Only pages actually created by content (via doc.addPage()) are stamped —
 * bufferPages does not add blank pages on its own, so page count always
 * matches what the content actually required.
 */
function finalizePdf(doc) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom + 14;
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor('#888')
      .text(DEVELOPER_FOOTER_TEXT, doc.page.margins.left, bottom, {
        width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
        align: 'center',
      });
    doc.fillColor('#000');
  }
  doc.end();
}

/**
 * Draw a simple table. columns: [{ header, width, key, align, format }]
 */
function drawTable(doc, columns, rows, options = {}) {
  const startX = doc.page.margins.left;
  const rowHeight = options.rowHeight || 20;
  let y = doc.y;

  function drawRow(values, opts = {}) {
    let x = startX;
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.fontSize || 8);
    if (opts.bg) {
      doc.rect(startX, y, columns.reduce((s, c) => s + c.width, 0), rowHeight).fill(opts.bg);
      doc.fillColor('#000');
    }
    columns.forEach((col, i) => {
      doc.text(String(values[i] ?? ''), x + 3, y + 5, { width: col.width - 6, align: col.align || 'left' });
      x += col.width;
    });
    y += rowHeight;
  }

  if (rows.length === 0) {
    doc.fontSize(9).fillColor('#888').text('No records.', startX, y);
    doc.fillColor('#000');
    doc.y = y + 20;
    return;
  }

  if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 25) {
    doc.addPage();
    y = doc.page.margins.top;
  }
  drawRow(columns.map((c) => c.header), { bold: true, bg: '#e5e7eb' });

  rows.forEach((row) => {
    if (y + rowHeight > doc.page.height - doc.page.margins.bottom - 25) {
      doc.addPage();
      y = doc.page.margins.top;
      drawRow(columns.map((c) => c.header), { bold: true, bg: '#e5e7eb' });
    }
    const values = columns.map((c) => {
      const raw = typeof c.key === 'function' ? c.key(row) : row[c.key];
      return c.format ? c.format(raw, row) : raw;
    });
    drawRow(values);
  });

  doc.y = y + 10;
}

function sectionTitle(doc, text) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
  doc.moveDown(0.6);
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#111').text(text);
  doc.fillColor('#000');
  doc.moveDown(0.2);
}

function generateReceiptPdf(res, { settings, customer, plan, installment, payment }) {
  const doc = startPdf(res, `receipt-${payment.receiptNumber}.pdf`);
  drawHeader(doc, settings, 'PAYMENT RECEIPT');

  doc.fontSize(9);
  doc.text(`Receipt No: ${payment.receiptNumber}`);
  doc.text(`Date: ${formatDate(payment.paymentDate)}`);
  doc.moveDown(0.5);
  doc.text(`Customer: ${customer.name}`);
  doc.text(`Phone: ${customer.contactNumber}`);
  if (customer.cnic) doc.text(`CNIC: ${customer.cnic}`);
  doc.moveDown(0.5);
  doc.text(`Product: ${plan.productName}`);
  doc.text(`Total Price: ${formatCurrency(plan.sellingPrice, settings.currency)}`);
  doc.text(`Down Payment: ${formatCurrency(plan.downPayment, settings.currency)}`);
  doc.text(`Installment Number: ${installment.installmentNumber}`);
  doc.text(`Installment Status: ${installment.status}`);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').text(`Amount Paid Today: ${formatCurrency(payment.amount, settings.currency)}`);
  doc.font('Helvetica').text(`Previous Remaining: ${formatCurrency(payment.previousBalance, settings.currency)}`);
  doc.text(`New Remaining: ${formatCurrency(payment.newBalance, settings.currency)}`);
  doc.text(`Payment Method: ${payment.paymentMethod}`);
  if (payment.notes) doc.text(`Notes: ${payment.notes}`);

  if (settings.showProfitOnReceipt) {
    doc.moveDown(0.5);
    doc.fillColor('#666').text(`Purchase Cost: ${formatCurrency(plan.purchaseCost, settings.currency)}`);
    doc.text(`Expected Profit: ${formatCurrency(plan.expectedProfit, settings.currency)}`);
    doc.fillColor('#000');
  }

  doc.moveDown(2);
  const y = doc.y;
  doc.text('Admin Signature: ______________________', 40, y);
  doc.text('Customer Signature: ______________________', 320, y);

  if (settings.receiptFooter) {
    doc.moveDown(3);
    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    doc.fontSize(8).fillColor('#666').text(settings.receiptFooter, doc.page.margins.left, doc.y, { width: pageWidth, align: 'center' });
    doc.fillColor('#000');
  }

  finalizePdf(doc);
}

function generateInstallmentSheetPdf(res, { settings, customer, plan, schedule }) {
  const doc = startPdf(res, `installment-sheet-${plan.contractId}.pdf`);
  drawHeader(doc, settings, 'INSTALLMENT SCHEDULE');

  doc.fontSize(9);
  doc.text(`Customer: ${customer.name}    Phone: ${customer.contactNumber}`);
  doc.text(`Product: ${plan.productName}`);
  doc.text(
    `Selling Price: ${formatCurrency(plan.sellingPrice, settings.currency)}    Monthly Installment: ${formatCurrency(
      plan.monthlyInstallment,
      settings.currency
    )}`
  );
  doc.text(`Advance/Down Payment: ${formatCurrency(plan.downPayment, settings.currency)}`);
  doc.text(`Total Paid: ${formatCurrency(plan.totalPaid, settings.currency)}    Remaining: ${formatCurrency(plan.remainingAmount, settings.currency)}`);
  doc.moveDown(0.8);

  drawTable(
    doc,
    [
      { header: 'No.', key: 'installmentNumber', width: 30, align: 'center' },
      { header: 'Month', key: 'monthLabel', width: 80 },
      { header: 'Due Date', key: 'dueDate', width: 65, format: (v) => formatDate(v) },
      { header: 'Amount Due', key: 'amountDue', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Paid', key: 'paidAmount', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Remaining', key: (r) => r.amountDue - r.paidAmount, width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Status', key: 'status', width: 60, align: 'center' },
      { header: 'Signature', key: () => '', width: 60 },
    ],
    schedule
  );

  finalizePdf(doc);
}

function generateGenericTablePdf(res, { settings, title, filename, columns, rows }) {
  const doc = startPdf(res, filename);
  drawHeader(doc, settings, title);
  drawTable(doc, columns, rows);
  finalizePdf(doc);
}

/**
 * Full customer record: customer info, product/sale info, installment history,
 * payment history, missed installments, profit/loss, and a summary — everything
 * an admin would want on one printed record for a single customer.
 */
function generateCustomerFullRecordPdf(res, { settings, customer, plans, schedule, payments, missedEvents }) {
  const doc = startPdf(res, `customer-record-${customer.customerId}.pdf`);
  drawHeader(doc, settings, `CUSTOMER FULL RECORD — ${customer.name}`);

  doc.fontSize(9);
  sectionTitle(doc, 'CUSTOMER INFORMATION');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Customer ID: ${customer.customerId}`);
  doc.text(`Name: ${customer.name}`);
  if (customer.fatherName) doc.text(`Father Name: ${customer.fatherName}`);
  if (customer.cnic) doc.text(`CNIC: ${customer.cnic}`);
  doc.text(`Phone: ${customer.contactNumber}`);
  if (customer.alternateContact) doc.text(`Alternate Contact: ${customer.alternateContact}`);
  if (customer.email) doc.text(`Email: ${customer.email}`);
  if (customer.address) doc.text(`Address: ${customer.address}`);

  let totalSale = 0;
  let totalCost = 0;
  let totalCollected = 0;
  let totalRemaining = 0;

  plans.forEach((plan) => {
    sectionTitle(doc, `PRODUCT / SALE — ${plan.contractId}`);
    doc.font('Helvetica').fontSize(9);
    doc.text(`Product: ${plan.productName}`);
    if (plan.productDescription) doc.text(`Description: ${plan.productDescription}`);
    doc.text(`Sale Date: ${formatDate(plan.startDate)}`);
    doc.text(`Total Sale Price: ${formatCurrency(plan.sellingPrice, settings.currency)}`);
    doc.text(`Cost Price: ${formatCurrency(plan.purchaseCost, settings.currency)}`);
    doc.text(`Advance / Down Payment: ${formatCurrency(plan.downPayment, settings.currency)}`);
    doc.text(`Remaining Amount: ${formatCurrency(plan.remainingAmount, settings.currency)}`);
    doc.text(`Installment Duration: ${plan.installmentDurationMonths} months`);
    doc.text(`Monthly Installment: ${formatCurrency(plan.monthlyInstallment, settings.currency)}`);
    doc.text(`Contract Status: ${plan.status}`);
    doc.text(
      `Funding Source: ${plan.fundingSource === 'INVESTOR' ? `Investor — ${plan.investorId?.name || ''} (${plan.investorId?.investorId || ''})` : 'Business / Own Funds'}`
    );
    if (plan.fundingSource === 'INVESTOR') {
      doc.text(`Capital Deployed: ${formatCurrency(plan.capitalDeployed, settings.currency)}`);
    }

    totalSale += plan.sellingPrice;
    totalCost += plan.purchaseCost;
    totalCollected += plan.totalPaid;
    totalRemaining += plan.remainingAmount;

    const planSchedule = schedule.filter((s) => String(s.planId) === String(plan._id));
    if (planSchedule.length) {
      sectionTitle(doc, 'INSTALLMENT HISTORY');
      drawTable(
        doc,
        [
          { header: 'No.', key: 'installmentNumber', width: 30, align: 'center' },
          { header: 'Due Date', key: 'dueDate', width: 65, format: (v) => formatDate(v) },
          { header: 'Expected', key: 'amountDue', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
          { header: 'Paid', key: 'paidAmount', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
          { header: 'Remaining', key: (r) => r.amountDue - r.paidAmount, width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
          { header: 'Status', key: 'status', width: 60, align: 'center' },
          { header: 'Paid On', key: 'paymentDate', width: 65, format: (v) => formatDate(v) },
        ],
        planSchedule
      );
    }
  });

  const planPayments = payments;
  sectionTitle(doc, 'PAYMENT HISTORY');
  drawTable(
    doc,
    [
      { header: 'Date', key: 'paymentDate', width: 65, format: (v) => formatDate(v) },
      { header: 'Amount Paid', key: 'amount', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Method', key: 'paymentMethod', width: 80 },
      { header: 'Receipt #', key: 'receiptNumber', width: 100 },
      { header: 'Remaining Balance', key: 'newBalance', width: 85, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    planPayments
  );

  sectionTitle(doc, 'MISSED INSTALLMENTS');
  drawTable(
    doc,
    [
      { header: 'Installment #', key: (r) => r.installmentId?.installmentNumber, width: 80, align: 'center' },
      { header: 'Due Date', key: (r) => r.installmentId?.dueDate, width: 70, format: (v) => formatDate(v) },
      { header: 'Missed Amount', key: 'missedAmount', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Status', key: 'status', width: 70, align: 'center' },
    ],
    missedEvents
  );

  const totalProfit = Math.max(0, totalSale - totalCost);
  const totalLoss = Math.max(0, totalCost - totalSale);

  sectionTitle(doc, 'PROFIT / LOSS');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Total Sale Price: ${formatCurrency(totalSale, settings.currency)}`);
  doc.text(`Total Cost: ${formatCurrency(totalCost, settings.currency)}`);
  doc.text(`Profit: ${formatCurrency(totalProfit, settings.currency)}`);
  doc.text(`Loss: ${formatCurrency(totalLoss, settings.currency)}`);
  doc.text(`Remaining Receivable Amount: ${formatCurrency(totalRemaining, settings.currency)}`);

  const paid = schedule.filter((s) => s.status === 'PAID').length;
  const partial = schedule.filter((s) => s.status === 'PARTIAL').length;
  const pending = schedule.filter((s) => s.status === 'PENDING').length;
  const missed = schedule.filter((s) => s.status === 'MISSED').length;
  const overdue = schedule.filter((s) => s.status === 'OVERDUE').length;

  sectionTitle(doc, 'SUMMARY');
  doc.font('Helvetica').fontSize(9);
  doc.text(`Total Installments: ${schedule.length}`);
  doc.text(`Paid: ${paid}    Partial: ${partial}    Pending: ${pending}    Missed: ${missed}    Overdue: ${overdue}`);
  doc.text(`Total Received: ${formatCurrency(totalCollected, settings.currency)}`);
  doc.text(`Total Remaining: ${formatCurrency(totalRemaining, settings.currency)}`);
  doc.text(`Total Profit/Loss: ${formatCurrency(totalProfit - totalLoss, settings.currency)}`);

  finalizePdf(doc);
}

module.exports = {
  startPdf,
  drawHeader,
  drawTable,
  finalizePdf,
  generateReceiptPdf,
  generateInstallmentSheetPdf,
  generateGenericTablePdf,
  generateCustomerFullRecordPdf,
};
