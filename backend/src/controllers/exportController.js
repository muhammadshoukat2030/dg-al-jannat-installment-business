const asyncHandler = require('../middleware/asyncHandler');
const BusinessSetting = require('../models/BusinessSetting');
const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const MissedInstallmentEvent = require('../models/MissedInstallmentEvent');
const { formatCurrency, formatDate } = require('../utils/formatHelpers');
const { generateReceiptPdf, generateInstallmentSheetPdf, generateGenericTablePdf, generateCustomerFullRecordPdf } = require('../utils/pdfGenerator');
const { generateExcel } = require('../utils/excelGenerator');
const { startOfDay } = require('../utils/dateHelpers');

async function getSettings() {
  let settings = await BusinessSetting.findOne();
  if (!settings) settings = await BusinessSetting.create({});
  return settings;
}

// ---------- RECEIPT / INSTALLMENT SHEET (customer-facing printables) ----------

const receiptPdf = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.paymentId);
  if (!payment) return res.status(404).json({ success: false, message: 'Payment not found.' });

  const [customer, plan, installment, settings] = await Promise.all([
    Customer.findById(payment.customerId),
    InstallmentPlan.findById(payment.planId),
    Installment.findById(payment.installmentId),
    getSettings(),
  ]);

  generateReceiptPdf(res, { settings, customer, plan, installment, payment });
});

const installmentSheetPdf = asyncHandler(async (req, res) => {
  const plan = await InstallmentPlan.findById(req.params.planId);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });

  const [customer, schedule, settings] = await Promise.all([
    Customer.findById(plan.customerId),
    Installment.find({ planId: plan._id }).sort({ installmentNumber: 1 }),
    getSettings(),
  ]);

  generateInstallmentSheetPdf(res, { settings, customer, plan, schedule });
});

const customerLedgerPdf = asyncHandler(async (req, res) => {
  const { customerId } = req.query;
  if (!customerId) return res.status(400).json({ success: false, message: 'customerId is required.' });

  const [customer, settings, plans, payments] = await Promise.all([
    Customer.findById(customerId),
    getSettings(),
    InstallmentPlan.find({ customerId }),
    Payment.find({ customerId }).sort({ paymentDate: 1 }),
  ]);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  generateGenericTablePdf(res, {
    settings,
    title: `CUSTOMER LEDGER — ${customer.name} (${customer.customerId})`,
    filename: `customer-ledger-${customer.customerId}.pdf`,
    columns: [
      { header: 'Date', key: 'paymentDate', width: 70, format: (v) => formatDate(v) },
      { header: 'Receipt #', key: 'receiptNumber', width: 100 },
      { header: 'Amount', key: 'amount', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Method', key: 'paymentMethod', width: 80 },
      { header: 'Previous Balance', key: 'previousBalance', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'New Balance', key: 'newBalance', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: payments,
  });
});

const customerFullRecordPdf = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.customerId);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  const [settings, plans, schedule, payments, missedEvents] = await Promise.all([
    getSettings(),
    InstallmentPlan.find({ customerId: customer._id }).populate('investorId', 'name investorId'),
    Installment.find({ customerId: customer._id }).sort({ dueDate: 1 }),
    Payment.find({ customerId: customer._id }).sort({ paymentDate: 1 }),
    MissedInstallmentEvent.find({ customerId: customer._id })
      .populate('installmentId', 'installmentNumber dueDate')
      .sort({ recordedDate: -1 }),
  ]);

  generateCustomerFullRecordPdf(res, { settings, customer, plans, schedule, payments, missedEvents });
});

// ---------- REPORT PDFs ----------

const dailyCollectionPdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const range = parseRange(req);
  const payments = await Payment.aggregate([
    { $match: range ? { paymentDate: range } : {} },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'DAILY COLLECTION REPORT',
    filename: 'daily-collection.pdf',
    columns: [
      { header: 'Date', key: '_id', width: 150 },
      { header: 'Total Collected', key: 'total', width: 150, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'No. of Payments', key: 'count', width: 100, align: 'center' },
    ],
    rows: payments,
  });
});

const monthlyCollectionPdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const range = parseRange(req);
  const payments = await Payment.aggregate([
    { $match: range ? { paymentDate: range } : {} },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$paymentDate' } }, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'MONTHLY COLLECTION REPORT',
    filename: 'monthly-collection.pdf',
    columns: [
      { header: 'Month', key: '_id', width: 150 },
      { header: 'Total Collected', key: 'total', width: 150, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'No. of Payments', key: 'count', width: 100, align: 'center' },
    ],
    rows: payments,
  });
});

const profitLossPdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const plans = await InstallmentPlan.find({}).populate('customerId', 'name contactNumber');

  generateGenericTablePdf(res, {
    settings,
    title: 'PROFIT / LOSS REPORT',
    filename: 'profit-loss-report.pdf',
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 90 },
      { header: 'Product', key: 'productName', width: 90 },
      { header: 'Cost', key: 'purchaseCost', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Selling', key: 'sellingPrice', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Profit', key: 'expectedProfit', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Loss', key: 'expectedLoss', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Margin %', key: 'profitMargin', width: 60, align: 'right', format: (v) => (v || 0).toFixed(2) },
    ],
    rows: plans,
  });
});

const outstandingPdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const plans = await InstallmentPlan.find({ remainingAmount: { $gt: 0 } })
    .populate('customerId', 'name contactNumber')
    .sort({ remainingAmount: -1 });

  generateGenericTablePdf(res, {
    settings,
    title: 'OUTSTANDING REPORT',
    filename: 'outstanding-report.pdf',
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 110 },
      { header: 'Phone', key: (r) => r.customerId?.contactNumber, width: 90 },
      { header: 'Selling Price', key: 'sellingPrice', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Paid', key: 'totalPaid', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Remaining', key: 'remainingAmount', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: plans,
  });
});

const overduePdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const today = startOfDay(new Date());
  const overdue = await Installment.find({ status: 'OVERDUE' })
    .populate('customerId', 'name contactNumber')
    .sort({ dueDate: 1 });

  const rows = overdue.map((i) => ({
    customerName: i.customerId?.name,
    phone: i.customerId?.contactNumber,
    installmentNumber: i.installmentNumber,
    dueDate: i.dueDate,
    daysOverdue: Math.floor((today - startOfDay(i.dueDate)) / (1000 * 60 * 60 * 24)),
    amountDue: i.amountDue,
    remaining: i.amountDue - i.paidAmount,
  }));

  generateGenericTablePdf(res, {
    settings,
    title: 'OVERDUE REPORT',
    filename: 'overdue-report.pdf',
    columns: [
      { header: 'Customer', key: 'customerName', width: 90 },
      { header: 'Phone', key: 'phone', width: 80 },
      { header: 'Inst. #', key: 'installmentNumber', width: 45, align: 'center' },
      { header: 'Due Date', key: 'dueDate', width: 65, format: (v) => formatDate(v) },
      { header: 'Days Overdue', key: 'daysOverdue', width: 70, align: 'center' },
      { header: 'Amount Due', key: 'amountDue', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Remaining', key: 'remaining', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows,
  });
});

const missedPdf = asyncHandler(async (req, res) => {
  const settings = await getSettings();
  const events = await MissedInstallmentEvent.find({})
    .populate('customerId', 'name contactNumber')
    .populate('installmentId', 'installmentNumber monthLabel')
    .sort({ recordedDate: -1 });

  generateGenericTablePdf(res, {
    settings,
    title: 'MISSED INSTALLMENT REPORT',
    filename: 'missed-installment-report.pdf',
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 100 },
      { header: 'Phone', key: (r) => r.customerId?.contactNumber, width: 90 },
      { header: 'Inst. #', key: (r) => r.installmentId?.installmentNumber, width: 45, align: 'center' },
      { header: 'Month', key: (r) => r.installmentId?.monthLabel, width: 90 },
      { header: 'Amount Due', key: 'amountDue', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Missed Amount', key: 'missedAmount', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: events,
  });
});

// ---------- EXCEL EXPORTS ----------

const customersExcel = asyncHandler(async (req, res) => {
  const customers = await Customer.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
  await generateExcel(res, {
    filename: 'customers.xlsx',
    sheetName: 'Customers',
    columns: [
      { header: 'Customer ID', key: 'customerId', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Father Name', key: 'fatherName', width: 20 },
      { header: 'CNIC', key: 'cnic', width: 20 },
      { header: 'Contact', key: 'contactNumber', width: 18 },
      { header: 'City', key: 'city', width: 15 },
      { header: 'Archived', key: 'isArchived', width: 12 },
      { header: 'Added On', key: 'createdAt', width: 15, format: (v) => formatDate(v) },
    ],
    rows: customers,
  });
});

const paymentsExcel = asyncHandler(async (req, res) => {
  const dateRange = require('../utils/dateFilter').parseDateFilter(req.query);
  const query = dateRange ? { paymentDate: dateRange } : {};
  const payments = await Payment.find(query).populate('customerId', 'name').populate('installmentId', 'installmentNumber').sort({ paymentDate: -1 });
  await generateExcel(res, {
    filename: 'payments.xlsx',
    sheetName: 'Payments',
    columns: [
      { header: 'Receipt #', key: 'receiptNumber', width: 20 },
      { header: 'Customer', dataKey: (r) => r.customerId?.name, key: 'customer', width: 25 },
      { header: 'Installment #', dataKey: (r) => r.installmentId?.installmentNumber, key: 'installmentNo', width: 15 },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Method', key: 'paymentMethod', width: 15 },
      { header: 'Previous Balance', key: 'previousBalance', width: 18 },
      { header: 'New Balance', key: 'newBalance', width: 15 },
      { header: 'Date', key: 'paymentDate', width: 15, format: (v) => formatDate(v) },
    ],
    rows: payments,
  });
});

const installmentsExcel = asyncHandler(async (req, res) => {
  const installments = await Installment.find({}).populate('customerId', 'name').sort({ dueDate: 1 });
  await generateExcel(res, {
    filename: 'installments.xlsx',
    sheetName: 'Installments',
    columns: [
      { header: 'Customer', dataKey: (r) => r.customerId?.name, key: 'customer', width: 25 },
      { header: 'No.', key: 'installmentNumber', width: 8 },
      { header: 'Month', key: 'monthLabel', width: 18 },
      { header: 'Due Date', key: 'dueDate', width: 15, format: (v) => formatDate(v) },
      { header: 'Amount Due', key: 'amountDue', width: 15 },
      { header: 'Paid', key: 'paidAmount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: installments,
  });
});

const outstandingExcel = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.find({ remainingAmount: { $gt: 0 } }).populate('customerId', 'name contactNumber');
  await generateExcel(res, {
    filename: 'outstanding.xlsx',
    sheetName: 'Outstanding',
    columns: [
      { header: 'Customer', dataKey: (r) => r.customerId?.name, key: 'customer', width: 25 },
      { header: 'Phone', dataKey: (r) => r.customerId?.contactNumber, key: 'phone', width: 18 },
      { header: 'Selling Price', key: 'sellingPrice', width: 15 },
      { header: 'Paid', dataKey: (r) => (r.totalPaid || 0) + (r.downPayment || 0), key: 'paid', width: 15 },
      { header: 'Remaining', key: 'remainingAmount', width: 15 },
    ],
    rows: plans,
  });
});

const overdueExcel = asyncHandler(async (req, res) => {
  const today = startOfDay(new Date());
  const overdue = await Installment.find({ status: 'OVERDUE' }).populate('customerId', 'name contactNumber').sort({ dueDate: 1 });
  const rows = overdue.map((i) => ({
    customer: i.customerId?.name,
    phone: i.customerId?.contactNumber,
    installmentNumber: i.installmentNumber,
    dueDate: i.dueDate,
    daysOverdue: Math.floor((today - startOfDay(i.dueDate)) / (1000 * 60 * 60 * 24)),
    amountDue: i.amountDue,
    remaining: i.amountDue - i.paidAmount,
  }));
  await generateExcel(res, {
    filename: 'overdue.xlsx',
    sheetName: 'Overdue',
    columns: [
      { header: 'Customer', key: 'customer', width: 25 },
      { header: 'Phone', key: 'phone', width: 18 },
      { header: 'Installment #', key: 'installmentNumber', width: 15 },
      { header: 'Due Date', key: 'dueDate', width: 15, format: (v) => formatDate(v) },
      { header: 'Days Overdue', key: 'daysOverdue', width: 15 },
      { header: 'Amount Due', key: 'amountDue', width: 15 },
      { header: 'Remaining', key: 'remaining', width: 15 },
    ],
    rows,
  });
});

const missedExcel = asyncHandler(async (req, res) => {
  const events = await MissedInstallmentEvent.find({})
    .populate('customerId', 'name contactNumber')
    .populate('installmentId', 'installmentNumber monthLabel')
    .sort({ recordedDate: -1 });
  await generateExcel(res, {
    filename: 'missed-installments.xlsx',
    sheetName: 'Missed',
    columns: [
      { header: 'Customer', dataKey: (r) => r.customerId?.name, key: 'customer', width: 25 },
      { header: 'Phone', dataKey: (r) => r.customerId?.contactNumber, key: 'phone', width: 18 },
      { header: 'Installment #', dataKey: (r) => r.installmentId?.installmentNumber, key: 'installmentNumber', width: 15 },
      { header: 'Month', dataKey: (r) => r.installmentId?.monthLabel, key: 'month', width: 18 },
      { header: 'Amount Due', key: 'amountDue', width: 15 },
      { header: 'Missed Amount', key: 'missedAmount', width: 15 },
      { header: 'Recorded Date', key: 'recordedDate', width: 15, format: (v) => formatDate(v) },
    ],
    rows: events,
  });
});

const profitLossExcel = asyncHandler(async (req, res) => {
  const plans = await InstallmentPlan.find({}).populate('customerId', 'name contactNumber');
  await generateExcel(res, {
    filename: 'profit-loss.xlsx',
    sheetName: 'Profit-Loss',
    columns: [
      { header: 'Customer', dataKey: (r) => r.customerId?.name, key: 'customer', width: 25 },
      { header: 'Product', key: 'productName', width: 20 },
      { header: 'Cost', key: 'purchaseCost', width: 12 },
      { header: 'Selling Price', key: 'sellingPrice', width: 15 },
      { header: 'Expected Profit', key: 'expectedProfit', width: 15 },
      { header: 'Expected Loss', key: 'expectedLoss', width: 15 },
      { header: 'Margin %', key: 'profitMargin', width: 12, format: (v) => (v || 0).toFixed(2) },
      { header: 'Collected', dataKey: (r) => (r.totalPaid || 0) + (r.downPayment || 0), key: 'totalPaid', width: 15 },
      { header: 'Remaining', key: 'remainingAmount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: plans,
  });
});

function parseRange(req) {
  const { from, to, preset } = req.query;
  if (preset) return require('../utils/dateFilter').parseDateFilter(req.query);
  const range = {};
  if (from) range.$gte = new Date(from);
  if (to) range.$lte = new Date(to);
  return Object.keys(range).length ? range : null;
}

module.exports = {
  receiptPdf,
  installmentSheetPdf,
  customerLedgerPdf,
  customerFullRecordPdf,
  dailyCollectionPdf,
  monthlyCollectionPdf,
  profitLossPdf,
  outstandingPdf,
  overduePdf,
  missedPdf,
  customersExcel,
  paymentsExcel,
  installmentsExcel,
  outstandingExcel,
  overdueExcel,
  missedExcel,
  profitLossExcel,
};
