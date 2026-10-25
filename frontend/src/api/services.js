import client from './client';

export const authApi = {
  login: (email, password) => client.post('/auth/login', { email, password }),
};

export const customerApi = {
  list: (params) => client.get('/customers', { params }),
  get: (id) => client.get(`/customers/${id}`),
  create: (data) => client.post('/customers', data),
  update: (id, data) => client.put(`/customers/${id}`, data),
  archive: (id) => client.delete(`/customers/${id}`),
  remove: (id) => client.delete(`/customers/${id}/delete`),
};

export const planApi = {
  list: (params) => client.get('/installment-plans', { params }),
  get: (id) => client.get(`/installment-plans/${id}`),
  create: (data) => client.post('/installment-plans', data),
  update: (id, data) => client.put(`/installment-plans/${id}`, data),
  changeDuration: (id, newDurationMonths, confirm) =>
    client.patch(`/installment-plans/${id}/duration`, { newDurationMonths, confirm }),
  changeMonthly: (id, newMonthlyInstallment, confirm) =>
    client.patch(`/installment-plans/${id}/monthly-installment`, { newMonthlyInstallment, confirm }),
};

export const installmentApi = {
  list: (params) => client.get('/installments', { params }),
  get: (id) => client.get(`/installments/${id}`),
  pay: (id, data) => client.post(`/installments/${id}/payment`, data),
  markMissed: (id, data) => client.post(`/installments/${id}/missed`, data),
};

export const paymentApi = {
  list: (params) => client.get('/payments', { params }),
};

export const dashboardApi = {
  summary: () => client.get('/dashboard/summary'),
  overdue: () => client.get('/dashboard/overdue'),
  outstanding: () => client.get('/dashboard/outstanding'),
};

export const investorApi = {
  list: (params) => client.get('/investors', { params }),
  get: (id) => client.get(`/investors/${id}`),
  create: (data) => client.post('/investors', data),
  update: (id, data) => client.put(`/investors/${id}`, data),
  archive: (id) => client.delete(`/investors/${id}`),
  remove: (id) => client.delete(`/investors/${id}/delete`),
  dashboardOverview: () => client.get('/investors/dashboard-overview'),

  listTransactions: (id, params) => client.get(`/investors/${id}/transactions`, { params }),
  addTransaction: (id, data) => client.post(`/investors/${id}/transactions`, data),

  fundedCustomers: (id, params) => client.get(`/investors/${id}/funded-customers`, { params }),
  fundedContracts: (id, params) => client.get(`/investors/${id}/funded-contracts`, { params }),
  installments: (id, params) => client.get(`/investors/${id}/installments`, { params }),
  payments: (id, params) => client.get(`/investors/${id}/payments`, { params }),
  profit: (id) => client.get(`/investors/${id}/profit`),
  withdrawals: (id, params) => client.get(`/investors/${id}/withdrawals`, { params }),
};

export const reportApi = {
  daily: (params) => client.get('/reports/daily', { params }),
  monthly: (params) => client.get('/reports/monthly', { params }),
  profit: () => client.get('/reports/profit'),
  loss: () => client.get('/reports/loss'),
  monthlyProfit: () => client.get('/reports/monthly-profit'),
  outstanding: () => client.get('/reports/outstanding'),
  overdue: () => client.get('/reports/overdue'),
  missed: () => client.get('/reports/missed'),
  customerLedger: (customerId) => client.get('/reports/customer-ledger', { params: { customerId } }),
};

export const settingsApi = {
  get: () => client.get('/settings'),
  update: (data) => client.put('/settings', data),
};

// Downloads/opens a binary (PDF/Excel) via the authenticated axios client, since these
// endpoints require the JWT Authorization header and can't be fetched via a plain <a href>.
//
// BUG FIX: previously this called window.open(blobUrl, '_blank') *after* the await for
// the blob response. By the time that runs, the browser no longer treats it as part of
// the original click's user gesture, so popup blockers silently swallow it — this was
// the actual reason PDFs appeared not to download. The fix: for anything meant to open
// in a new tab, open a blank window SYNCHRONOUSLY (before the await) and only set its
// location once the blob is ready. Actual downloads use a hidden <a download> click,
// which is never subject to popup blocking.

function toQueryString(params = {}) {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  const qs = new URLSearchParams(clean).toString();
  return qs ? `?${qs}` : '';
}

async function fetchBlob(url) {
  const res = await client.get(url, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  return { blob: res.data, filename: match ? match[1] : null };
}

async function downloadFile(url, fallbackFilename) {
  const { blob, filename } = await fetchBlob(url);
  const blobUrl = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = filename || fallbackFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
}

// For "view/print" style PDF actions. Opens a blank tab synchronously (inside the
// original click handler, before any await) so it survives popup-blocker checks,
// then points it at the blob once it's ready.
async function openFile(url, fallbackFilename) {
  const newTab = window.open('', '_blank');
  try {
    const { blob } = await fetchBlob(url);
    const blobUrl = window.URL.createObjectURL(blob);
    if (newTab) {
      newTab.location.href = blobUrl;
    } else {
      // Popup blocked even for the synchronous open (rare, e.g. some mobile browsers) —
      // fall back to a guaranteed download instead of failing silently.
      await downloadFile(url, fallbackFilename);
    }
  } catch (err) {
    if (newTab) newTab.close();
    throw err;
  }
}

export const exportApi = {
  receiptPdf: (paymentId) => openFile(`/exports/receipt/${paymentId}/pdf`, 'receipt.pdf'),
  receiptPdfDownload: (paymentId) => downloadFile(`/exports/receipt/${paymentId}/pdf`, 'receipt.pdf'),
  receiptBlob: (paymentId) => fetchBlob(`/exports/receipt/${paymentId}/pdf`),

  installmentSheetPdf: (planId) => openFile(`/exports/installment-sheet/${planId}/pdf`, 'installment-sheet.pdf'),
  installmentSheetPdfDownload: (planId) => downloadFile(`/exports/installment-sheet/${planId}/pdf`, 'installment-sheet.pdf'),
  installmentSheetBlob: (planId) => fetchBlob(`/exports/installment-sheet/${planId}/pdf`),

  customerLedgerPdf: (customerId) => openFile(`/exports/customer-ledger/pdf?customerId=${customerId}`, 'customer-ledger.pdf'),
  customerLedgerPdfDownload: (customerId) => downloadFile(`/exports/customer-ledger/pdf?customerId=${customerId}`, 'customer-ledger.pdf'),
  customerLedgerBlob: (customerId) => fetchBlob(`/exports/customer-ledger/pdf?customerId=${customerId}`),

  customerFullRecordPdf: (customerId) => openFile(`/exports/customer-full-record/${customerId}/pdf`, 'customer-record.pdf'),
  customerFullRecordPdfDownload: (customerId) => downloadFile(`/exports/customer-full-record/${customerId}/pdf`, 'customer-record.pdf'),
  customerFullRecordBlob: (customerId) => fetchBlob(`/exports/customer-full-record/${customerId}/pdf`),

  dailyCollectionPdf: (filters) => openFile(`/exports/reports/daily/pdf${toQueryString(filters)}`, 'daily-collection.pdf'),
  monthlyCollectionPdf: (filters) => openFile(`/exports/reports/monthly/pdf${toQueryString(filters)}`, 'monthly-collection.pdf'),
  profitLossPdf: () => openFile('/exports/reports/profit-loss/pdf', 'profit-loss-report.pdf'),
  profitLossBlob: () => fetchBlob('/exports/reports/profit-loss/pdf'),
  outstandingPdf: () => openFile('/exports/reports/outstanding/pdf', 'outstanding-report.pdf'),
  outstandingBlob: () => fetchBlob('/exports/reports/outstanding/pdf'),
  overduePdf: () => openFile('/exports/reports/overdue/pdf', 'overdue-report.pdf'),
  overdueBlob: () => fetchBlob('/exports/reports/overdue/pdf'),
  missedPdf: () => openFile('/exports/reports/missed/pdf', 'missed-installment-report.pdf'),
  missedBlob: () => fetchBlob('/exports/reports/missed/pdf'),

  customersExcel: () => downloadFile('/exports/customers/excel', 'customers.xlsx'),
  paymentsExcel: (filters) => downloadFile(`/exports/payments/excel${toQueryString(filters)}`, 'payments.xlsx'),
  installmentsExcel: () => downloadFile('/exports/installments/excel', 'installments.xlsx'),
  outstandingExcel: () => downloadFile('/exports/outstanding/excel', 'outstanding.xlsx'),
  overdueExcel: () => downloadFile('/exports/overdue/excel', 'overdue.xlsx'),
  missedExcel: () => downloadFile('/exports/missed/excel', 'missed-installments.xlsx'),
  profitLossExcel: () => downloadFile('/exports/profit-loss/excel', 'profit-loss.xlsx'),
};

export const investorExportApi = {
  summaryPdf: (id) => openFile(`/investor-exports/${id}/summary/pdf`, 'investor-summary.pdf'),
  summaryBlob: (id) => fetchBlob(`/investor-exports/${id}/summary/pdf`),

  transactionsPdf: (id) => openFile(`/investor-exports/${id}/transactions/pdf`, 'investor-transactions.pdf'),
  transactionsBlob: (id) => fetchBlob(`/investor-exports/${id}/transactions/pdf`),

  fundedCustomersPdf: (id) => openFile(`/investor-exports/${id}/funded-customers/pdf`, 'investor-funded-customers.pdf'),
  fundedCustomersBlob: (id) => fetchBlob(`/investor-exports/${id}/funded-customers/pdf`),

  installmentsPdf: (id) => openFile(`/investor-exports/${id}/installments/pdf`, 'investor-installments.pdf'),
  installmentsBlob: (id) => fetchBlob(`/investor-exports/${id}/installments/pdf`),

  outstandingPdf: (id) => openFile(`/investor-exports/${id}/outstanding/pdf`, 'investor-outstanding.pdf'),
  outstandingBlob: (id) => fetchBlob(`/investor-exports/${id}/outstanding/pdf`),

  fullHistoryPdf: (id) => openFile(`/investor-exports/${id}/full-history/pdf`, 'investor-full-history.pdf'),
  fullHistoryBlob: (id) => fetchBlob(`/investor-exports/${id}/full-history/pdf`),

  summaryExcel: (id) => downloadFile(`/investor-exports/${id}/summary/excel`, 'investor-summary.xlsx'),
  transactionsExcel: (id) => downloadFile(`/investor-exports/${id}/transactions/excel`, 'investor-transactions.xlsx'),
  customersExcel: (id) => downloadFile(`/investor-exports/${id}/customers/excel`, 'investor-customers.xlsx'),
  contractsExcel: (id) => downloadFile(`/investor-exports/${id}/contracts/excel`, 'investor-contracts.xlsx'),
  installmentsExcel: (id) => downloadFile(`/investor-exports/${id}/installments/excel`, 'investor-installments.xlsx'),
  outstandingExcel: (id) => downloadFile(`/investor-exports/${id}/outstanding/excel`, 'investor-outstanding.xlsx'),
};

export const ownerApi = {
  summary: () => client.get('/owner/summary'),
  profit: () => client.get('/owner/profit'),
  capital: () => client.get('/owner/capital'),
  addCapitalTransaction: (data) => client.post('/owner/capital', data),
  transactions: (params) => client.get('/owner/transactions', { params }),
  withdrawals: (params) => client.get('/owner/withdrawals', { params }),
};

export const withdrawalApi = {
  list: (params) => client.get('/withdrawals', { params }),
  get: (id) => client.get(`/withdrawals/${id}`),
  create: (data) => client.post('/withdrawals', data),
};

export const fundingApi = {
  get: (planId) => client.get(`/funding/${planId}`),
  allocate: (planId, allocations) => client.post(`/funding/${planId}/allocate`, { allocations }),
};
