const asyncHandler = require('../middleware/asyncHandler');
const BusinessSetting = require('../models/BusinessSetting');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const { formatCurrency, formatDate } = require('../utils/formatHelpers');
const { generateGenericTablePdf } = require('../utils/pdfGenerator');
const { generateExcel } = require('../utils/excelGenerator');
const investorService = require('../services/investorService');

async function getSettings() {
  let settings = await BusinessSetting.findOne();
  if (!settings) settings = await BusinessSetting.create({});
  return settings;
}

async function loadInvestor(id) {
  const investor = await Investor.findById(id);
  if (!investor || investor.isDeleted) return null;
  return investor;
}

// ---------- PDF ----------

const summaryPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const [settings, capital, installmentStats] = await Promise.all([
    getSettings(),
    investorService.getInvestorCapitalSummary(investor._id),
    investorService.getInvestorInstallmentStats(investor._id),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR SUMMARY — ${investor.name} (${investor.investorId})`,
    filename: `investor-summary-${investor.investorId}.pdf`,
    columns: [
      { header: 'Metric', key: 'label', width: 260 },
      { header: 'Value', key: 'value', width: 200, align: 'right' },
    ],
    rows: [
      { label: 'Total Invested', value: formatCurrency(capital.totalInvested, settings.currency) },
      { label: 'Total Returned', value: formatCurrency(capital.totalReturned, settings.currency) },
      { label: 'Capital Held', value: formatCurrency(capital.capitalHeld, settings.currency) },
      { label: 'Capital Deployed', value: formatCurrency(capital.capitalDeployed, settings.currency) },
      { label: 'Capital Available', value: formatCurrency(capital.capitalAvailable, settings.currency) },
      { label: 'Customers Funded', value: capital.customersFunded },
      { label: 'Contracts Funded', value: capital.contractsFunded },
      { label: 'Customer Collections', value: formatCurrency(capital.customerCollections, settings.currency) },
      { label: 'Outstanding', value: formatCurrency(capital.outstanding, settings.currency) },
      { label: 'Paid Installments', value: installmentStats.PAID },
      { label: 'Partial Installments', value: installmentStats.PARTIAL },
      { label: 'Pending Installments', value: installmentStats.PENDING },
      { label: 'Missed Installments', value: installmentStats.MISSED },
      { label: 'Overdue Installments', value: installmentStats.OVERDUE },
      { label: 'Expected Profit (informational)', value: formatCurrency(capital.expectedProfit, settings.currency) },
      { label: 'Expected Loss (informational)', value: formatCurrency(capital.expectedLoss, settings.currency) },
    ],
  });
});

const transactionsPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const [settings, transactions] = await Promise.all([
    getSettings(),
    InvestorTransaction.find({ investorId: investor._id }).sort({ transactionDate: -1 }),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR TRANSACTIONS — ${investor.name}`,
    filename: `investor-transactions-${investor.investorId}.pdf`,
    columns: [
      { header: 'Date', key: 'transactionDate', width: 80, format: (v) => formatDate(v) },
      { header: 'Type', key: 'transactionType', width: 150 },
      { header: 'Amount', key: 'amount', width: 100, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Notes', key: 'notes', width: 130 },
    ],
    rows: transactions,
  });
});

const fundedCustomersPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const settings = await getSettings();
  const result = await investorService.getFundedCustomers(investor._id, { page: 1, limit: 1000 });

  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR FUNDED CUSTOMERS — ${investor.name}`,
    filename: `investor-funded-customers-${investor.investorId}.pdf`,
    columns: [
      { header: 'Customer', key: (r) => r.customer?.name, width: 100 },
      { header: 'Phone', key: (r) => r.customer?.contactNumber, width: 90 },
      { header: 'Contracts Funded', key: 'contractsFunded', width: 70, align: 'center' },
      { header: 'Deployed', key: 'deployed', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Collected', key: 'collected', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Outstanding', key: 'outstanding', width: 75, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: result.data,
  });
});

const installmentsPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const settings = await getSettings();
  const result = await investorService.getInvestorInstallments(investor._id, { page: 1, limit: 2000 });

  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR INSTALLMENT HISTORY — ${investor.name}`,
    filename: `investor-installments-${investor.investorId}.pdf`,
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 90 },
      { header: 'Product', key: (r) => r.planId?.productName, width: 80 },
      { header: 'No.', key: 'installmentNumber', width: 35, align: 'center' },
      { header: 'Due Date', key: 'dueDate', width: 65, format: (v) => formatDate(v) },
      { header: 'Expected', key: 'amountDue', width: 65, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Paid', key: 'paidAmount', width: 60, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Status', key: 'status', width: 55, align: 'center' },
    ],
    rows: result.data,
  });
});

const outstandingPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const settings = await getSettings();
  const result = await investorService.getFundedContracts(investor._id, { page: 1, limit: 1000 });
  const outstandingOnly = result.data.filter((p) => p.remainingAmount > 0);

  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR OUTSTANDING — ${investor.name}`,
    filename: `investor-outstanding-${investor.investorId}.pdf`,
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 100 },
      { header: 'Contract', key: 'contractId', width: 90 },
      { header: 'Product', key: 'productName', width: 90 },
      { header: 'Deployed', key: 'capitalDeployed', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Outstanding', key: 'remainingAmount', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: outstandingOnly,
  });
});

const fullHistoryPdf = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });

  const settings = await getSettings();
  const [capital, installmentStats, transactions, fundedCustomers] = await Promise.all([
    investorService.getInvestorCapitalSummary(investor._id),
    investorService.getInvestorInstallmentStats(investor._id),
    InvestorTransaction.find({ investorId: investor._id }).sort({ transactionDate: -1 }),
    investorService.getFundedCustomers(investor._id, { page: 1, limit: 1000 }),
  ]);

  // Full history = summary metrics + full transaction ledger + funded customers,
  // all on one document — built with the same generic table renderer used elsewhere.
  generateGenericTablePdf(res, {
    settings,
    title: `INVESTOR FULL HISTORY — ${investor.name} (${investor.investorId})`,
    filename: `investor-full-history-${investor.investorId}.pdf`,
    columns: [
      { header: 'Section', key: 'section', width: 130 },
      { header: 'Detail', key: 'detail', width: 200 },
      { header: 'Value', key: 'value', width: 130, align: 'right' },
    ],
    rows: [
      { section: 'Summary', detail: 'Total Invested', value: formatCurrency(capital.totalInvested, settings.currency) },
      { section: 'Summary', detail: 'Total Returned', value: formatCurrency(capital.totalReturned, settings.currency) },
      { section: 'Summary', detail: 'Capital Held', value: formatCurrency(capital.capitalHeld, settings.currency) },
      { section: 'Summary', detail: 'Capital Deployed', value: formatCurrency(capital.capitalDeployed, settings.currency) },
      { section: 'Summary', detail: 'Capital Available', value: formatCurrency(capital.capitalAvailable, settings.currency) },
      { section: 'Installments', detail: 'Paid', value: installmentStats.PAID },
      { section: 'Installments', detail: 'Partial', value: installmentStats.PARTIAL },
      { section: 'Installments', detail: 'Missed', value: installmentStats.MISSED },
      { section: 'Installments', detail: 'Overdue', value: installmentStats.OVERDUE },
      ...transactions.map((t) => ({
        section: 'Transaction',
        detail: `${t.transactionType} (${formatDate(t.transactionDate)})`,
        value: formatCurrency(t.amount, settings.currency),
      })),
      ...fundedCustomers.data.map((c) => ({
        section: 'Funded Customer',
        detail: `${c.customer?.name} — ${c.contractsFunded} contract(s)`,
        value: formatCurrency(c.deployed, settings.currency),
      })),
    ],
  });
});

// ---------- Excel ----------

const summaryExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const capital = await investorService.getInvestorCapitalSummary(investor._id);

  await generateExcel(res, {
    filename: `investor-summary-${investor.investorId}.xlsx`,
    sheetName: 'Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 30 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows: Object.entries(capital).map(([metric, value]) => ({ metric, value })),
  });
});

const transactionsExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const transactions = await InvestorTransaction.find({ investorId: investor._id }).sort({ transactionDate: -1 });

  await generateExcel(res, {
    filename: `investor-transactions-${investor.investorId}.xlsx`,
    sheetName: 'Transactions',
    columns: [
      { header: 'Date', key: 'date', width: 15, dataKey: 'transactionDate', format: (v) => formatDate(v) },
      { header: 'Type', key: 'type', width: 20, dataKey: 'transactionType' },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Notes', key: 'notes', width: 30 },
    ],
    rows: transactions,
  });
});

const customersExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const result = await investorService.getFundedCustomers(investor._id, { page: 1, limit: 5000 });

  await generateExcel(res, {
    filename: `investor-customers-${investor.investorId}.xlsx`,
    sheetName: 'Funded Customers',
    columns: [
      { header: 'Customer', key: 'customer', width: 25, dataKey: (r) => r.customer?.name },
      { header: 'Phone', key: 'phone', width: 18, dataKey: (r) => r.customer?.contactNumber },
      { header: 'Contracts Funded', key: 'contractsFunded', width: 16 },
      { header: 'Deployed', key: 'deployed', width: 15 },
      { header: 'Collected', key: 'collected', width: 15 },
      { header: 'Outstanding', key: 'outstanding', width: 15 },
    ],
    rows: result.data,
  });
});

const contractsExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const result = await investorService.getFundedContracts(investor._id, { page: 1, limit: 5000 });

  await generateExcel(res, {
    filename: `investor-contracts-${investor.investorId}.xlsx`,
    sheetName: 'Funded Contracts',
    columns: [
      { header: 'Contract ID', key: 'contractId', width: 15 },
      { header: 'Customer', key: 'customer', width: 25, dataKey: (r) => r.customerId?.name },
      { header: 'Product', key: 'product', width: 20, dataKey: 'productName' },
      { header: 'Sale Price', key: 'sellingPrice', width: 15 },
      { header: 'Capital Deployed', key: 'capitalDeployed', width: 18 },
      { header: 'Paid', key: 'totalPaid', width: 15 },
      { header: 'Outstanding', key: 'remainingAmount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: result.data,
  });
});

const installmentsExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const result = await investorService.getInvestorInstallments(investor._id, { page: 1, limit: 10000 });

  await generateExcel(res, {
    filename: `investor-installments-${investor.investorId}.xlsx`,
    sheetName: 'Installments',
    columns: [
      { header: 'Customer', key: 'customer', width: 25, dataKey: (r) => r.customerId?.name },
      { header: 'Product', key: 'product', width: 20, dataKey: (r) => r.planId?.productName },
      { header: 'No.', key: 'installmentNumber', width: 8 },
      { header: 'Due Date', key: 'dueDate', width: 15, format: (v) => formatDate(v) },
      { header: 'Expected', key: 'amountDue', width: 15 },
      { header: 'Paid', key: 'paidAmount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: result.data,
  });
});

const outstandingExcel = asyncHandler(async (req, res) => {
  const investor = await loadInvestor(req.params.id);
  if (!investor) return res.status(404).json({ success: false, message: 'Investor not found.' });
  const result = await investorService.getFundedContracts(investor._id, { page: 1, limit: 5000 });
  const outstandingOnly = result.data.filter((p) => p.remainingAmount > 0);

  await generateExcel(res, {
    filename: `investor-outstanding-${investor.investorId}.xlsx`,
    sheetName: 'Outstanding',
    columns: [
      { header: 'Customer', key: 'customer', width: 25, dataKey: (r) => r.customerId?.name },
      { header: 'Contract', key: 'contractId', width: 15 },
      { header: 'Product', key: 'product', width: 20, dataKey: 'productName' },
      { header: 'Deployed', key: 'capitalDeployed', width: 15 },
      { header: 'Outstanding', key: 'remainingAmount', width: 15 },
    ],
    rows: outstandingOnly,
  });
});

module.exports = {
  summaryPdf,
  transactionsPdf,
  fundedCustomersPdf,
  installmentsPdf,
  outstandingPdf,
  fullHistoryPdf,
  summaryExcel,
  transactionsExcel,
  customersExcel,
  contractsExcel,
  installmentsExcel,
  outstandingExcel,
};
