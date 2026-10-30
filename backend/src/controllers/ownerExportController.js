const asyncHandler = require('../middleware/asyncHandler');
const BusinessSetting = require('../models/BusinessSetting');
const OwnerTransaction = require('../models/OwnerTransaction');
const { formatCurrency, formatDate } = require('../utils/formatHelpers');
const { generateGenericTablePdf } = require('../utils/pdfGenerator');
const { generateExcel } = require('../utils/excelGenerator');
const ownerService = require('../services/ownerService');
const accountingService = require('../services/accountingService');

async function getSettings() {
  let settings = await BusinessSetting.findOne();
  if (!settings) settings = await BusinessSetting.create({});
  return settings;
}

// --- PDF Exports ---

const summaryPdf = asyncHandler(async (req, res) => {
  const [settings, capital, profit, funded] = await Promise.all([
    getSettings(),
    accountingService.getOwnerCapitalSummary(),
    accountingService.getOwnerProfitSummary(),
    ownerService.getOwnerFundedSummary(),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'OWNER FINANCIAL SUMMARY',
    filename: 'owner-summary.pdf',
    columns: [
      { header: 'Metric', key: 'label', width: 260 },
      { header: 'Value', key: 'value', width: 200, align: 'right' },
    ],
    rows: [
      { label: 'Capital Held', value: formatCurrency(capital.capitalHeld, settings.currency) },
      { label: 'Capital Deployed', value: formatCurrency(capital.capitalDeployed, settings.currency) },
      { label: 'Capital Still Deployed', value: formatCurrency(capital.capitalStillDeployed, settings.currency) },
      { label: 'Recovered Capital', value: formatCurrency(capital.recoveredCapital, settings.currency) },
      { label: 'Capital Available', value: formatCurrency(capital.capitalAvailable, settings.currency) },
      { label: 'Total Profit Earned (50% Share)', value: formatCurrency(profit.totalOwnerProfit, settings.currency) },
      { label: 'Profit Withdrawn as Cash', value: formatCurrency(profit.totalOwnerCashWithdrawn, settings.currency) },
      { label: 'Profit Transferred to Capital', value: formatCurrency(profit.totalOwnerProfitToCapital, settings.currency) },
      { label: 'Remaining Available Profit', value: formatCurrency(profit.totalOwnerRemaining, settings.currency) },
      { label: 'Customers Funded', value: funded.customersFunded },
      { label: 'Contracts Funded', value: funded.contractsFunded },
      { label: 'Total Capital Deployed (Contracts)', value: formatCurrency(funded.totalCapitalDeployed, settings.currency) },
      { label: 'Total Collections from Funded Contracts', value: formatCurrency(funded.totalCollections, settings.currency) },
      { label: 'Total Outstanding', value: formatCurrency(funded.totalOutstanding, settings.currency) },
      { label: 'Total Expected Profit (Contracts)', value: formatCurrency(funded.totalExpectedProfit, settings.currency) },
    ],
  });
});

const transactionsPdf = asyncHandler(async (req, res) => {
  const [settings, transactions] = await Promise.all([
    getSettings(),
    OwnerTransaction.find().sort({ transactionDate: -1 }),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'OWNER TRANSACTIONS',
    filename: 'owner-transactions.pdf',
    columns: [
      { header: 'Date', key: 'transactionDate', width: 80, format: (v) => formatDate(v) },
      { header: 'Type', key: 'transactionType', width: 160 },
      { header: 'Amount', key: 'amount', width: 100, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Notes', key: 'notes', width: 120 },
    ],
    rows: transactions,
  });
});

const fundedCustomersPdf = asyncHandler(async (req, res) => {
  const [settings, result] = await Promise.all([
    getSettings(),
    ownerService.getOwnerFundedCustomers({ page: 1, limit: 2000 }),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'OWNER FUNDED CUSTOMERS',
    filename: 'owner-funded-customers.pdf',
    columns: [
      { header: 'Customer', key: (r) => r.customer?.name, width: 100 },
      { header: 'Phone', key: (r) => r.customer?.contactNumber, width: 90 },
      { header: 'Contracts Funded', key: 'contractsFunded', width: 70, align: 'center' },
      { header: 'Deployed', key: 'deployed', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Collected', key: 'collected', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Outstanding', key: 'outstanding', width: 80, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: result.data,
  });
});

const fundedContractsPdf = asyncHandler(async (req, res) => {
  const [settings, result] = await Promise.all([
    getSettings(),
    ownerService.getOwnerFundedContracts({ page: 1, limit: 2000 }),
  ]);

  generateGenericTablePdf(res, {
    settings,
    title: 'OWNER FUNDED CONTRACTS',
    filename: 'owner-funded-contracts.pdf',
    columns: [
      { header: 'Contract ID', key: 'contractId', width: 80 },
      { header: 'Customer', key: (r) => r.customerId?.name, width: 90 },
      { header: 'Product', key: 'productName', width: 90 },
      { header: 'Sale Price', key: 'sellingPrice', width: 75, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Cost', key: 'purchaseCost', width: 70, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Collected', key: (r) => (r.totalPaid || 0) + (r.downPayment || 0), width: 75, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Outstanding', key: 'remainingAmount', width: 75, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
      { header: 'Status', key: 'status', width: 55, align: 'center' },
    ],
    rows: result.data,
  });
});

const outstandingPdf = asyncHandler(async (req, res) => {
  const [settings, result] = await Promise.all([
    getSettings(),
    ownerService.getOwnerFundedContracts({ page: 1, limit: 2000 }),
  ]);
  const outstandingOnly = result.data.filter((p) => (p.remainingAmount || 0) > 0);

  generateGenericTablePdf(res, {
    settings,
    title: 'OWNER OUTSTANDING CONTRACTS',
    filename: 'owner-outstanding.pdf',
    columns: [
      { header: 'Customer', key: (r) => r.customerId?.name, width: 110 },
      { header: 'Contract', key: 'contractId', width: 90 },
      { header: 'Product', key: 'productName', width: 100 },
      { header: 'Outstanding', key: 'remainingAmount', width: 90, align: 'right', format: (v) => formatCurrency(v, settings.currency) },
    ],
    rows: outstandingOnly,
  });
});

// --- Excel Exports ---

const summaryExcel = asyncHandler(async (req, res) => {
  const [capital, profit, funded] = await Promise.all([
    accountingService.getOwnerCapitalSummary(),
    accountingService.getOwnerProfitSummary(),
    ownerService.getOwnerFundedSummary(),
  ]);
  const rows = [
    { metric: 'Capital Held', value: capital.capitalHeld },
    { metric: 'Capital Deployed', value: capital.capitalDeployed },
    { metric: 'Capital Still Deployed', value: capital.capitalStillDeployed },
    { metric: 'Recovered Capital', value: capital.recoveredCapital },
    { metric: 'Capital Available', value: capital.capitalAvailable },
    { metric: 'Total Profit Earned (50% Share)', value: profit.totalOwnerProfit },
    { metric: 'Profit Withdrawn as Cash', value: profit.totalOwnerCashWithdrawn },
    { metric: 'Profit Transferred to Capital', value: profit.totalOwnerProfitToCapital },
    { metric: 'Remaining Available Profit', value: profit.totalOwnerRemaining },
    { metric: 'Customers Funded', value: funded.customersFunded },
    { metric: 'Contracts Funded', value: funded.contractsFunded },
    { metric: 'Total Collections from Funded Contracts', value: funded.totalCollections },
    { metric: 'Total Outstanding', value: funded.totalOutstanding },
  ];

  await generateExcel(res, {
    filename: 'owner-summary.xlsx',
    sheetName: 'Owner Summary',
    columns: [
      { header: 'Metric', key: 'metric', width: 40 },
      { header: 'Value', key: 'value', width: 20 },
    ],
    rows,
  });
});

const transactionsExcel = asyncHandler(async (req, res) => {
  const transactions = await OwnerTransaction.find().sort({ transactionDate: -1 });

  await generateExcel(res, {
    filename: 'owner-transactions.xlsx',
    sheetName: 'Transactions',
    columns: [
      { header: 'Date', key: 'date', width: 15, dataKey: 'transactionDate', format: (v) => formatDate(v) },
      { header: 'Type', key: 'type', width: 25, dataKey: 'transactionType' },
      { header: 'Amount', key: 'amount', width: 15 },
      { header: 'Notes', key: 'notes', width: 35 },
    ],
    rows: transactions,
  });
});

const fundedCustomersExcel = asyncHandler(async (req, res) => {
  const result = await ownerService.getOwnerFundedCustomers({ page: 1, limit: 5000 });

  await generateExcel(res, {
    filename: 'owner-funded-customers.xlsx',
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

const fundedContractsExcel = asyncHandler(async (req, res) => {
  const result = await ownerService.getOwnerFundedContracts({ page: 1, limit: 5000 });

  await generateExcel(res, {
    filename: 'owner-funded-contracts.xlsx',
    sheetName: 'Funded Contracts',
    columns: [
      { header: 'Contract ID', key: 'contractId', width: 15 },
      { header: 'Customer', key: 'customer', width: 25, dataKey: (r) => r.customerId?.name },
      { header: 'Product', key: 'productName', width: 20 },
      { header: 'Sale Price', key: 'sellingPrice', width: 15 },
      { header: 'Purchase Cost', key: 'purchaseCost', width: 15 },
      { header: 'Total Paid', key: 'totalPaid', width: 15 },
      { header: 'Outstanding', key: 'remainingAmount', width: 15 },
      { header: 'Status', key: 'status', width: 12 },
    ],
    rows: result.data,
  });
});

module.exports = {
  summaryPdf,
  transactionsPdf,
  fundedCustomersPdf,
  fundedContractsPdf,
  outstandingPdf,
  summaryExcel,
  transactionsExcel,
  fundedCustomersExcel,
  fundedContractsExcel,
};
