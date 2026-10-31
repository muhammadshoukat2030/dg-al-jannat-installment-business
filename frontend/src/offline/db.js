/**
 * IndexedDB abstraction for Installment Management System 6
 * Provides durable local storage for customers, plans, installments, payments,
 * investors, metadata, and the offline operations queue.
 */

const DB_NAME = 'ims_offline_db';
const DB_VERSION = 3;

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this browser environment.'));
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Customers store
      if (!db.objectStoreNames.contains('customers')) {
        const store = db.createObjectStore('customers', { keyPath: '_id' });
        store.createIndex('customerId', 'customerId', { unique: false });
        store.createIndex('name', 'name', { unique: false });
        store.createIndex('contactNumber', 'contactNumber', { unique: false });
        store.createIndex('isArchived', 'isArchived', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // 2. Installment Plans store
      if (!db.objectStoreNames.contains('installmentPlans')) {
        const store = db.createObjectStore('installmentPlans', { keyPath: '_id' });
        store.createIndex('customerId', 'customerId', { unique: false });
        store.createIndex('contractId', 'contractId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
      }

      // 3. Installments store
      if (!db.objectStoreNames.contains('installments')) {
        const store = db.createObjectStore('installments', { keyPath: '_id' });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('customerId', 'customerId', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('dueDate', 'dueDate', { unique: false });
      }

      // 4. Payments store
      if (!db.objectStoreNames.contains('payments')) {
        const store = db.createObjectStore('payments', { keyPath: '_id' });
        store.createIndex('customerId', 'customerId', { unique: false });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('installmentId', 'installmentId', { unique: false });
        store.createIndex('operationId', 'operationId', { unique: false });
        store.createIndex('paymentDate', 'paymentDate', { unique: false });
      }

      // 5. Investors store
      if (!db.objectStoreNames.contains('investors')) {
        const store = db.createObjectStore('investors', { keyPath: '_id' });
        store.createIndex('investorId', 'investorId', { unique: false });
        store.createIndex('name', 'name', { unique: false });
      }

      // 6. Investor Transactions store
      if (!db.objectStoreNames.contains('investorTransactions')) {
        const store = db.createObjectStore('investorTransactions', { keyPath: '_id' });
        store.createIndex('investorId', 'investorId', { unique: false });
        store.createIndex('transactionDate', 'transactionDate', { unique: false });
      }

      // 7. Withdrawals store
      if (!db.objectStoreNames.contains('withdrawals')) {
        const store = db.createObjectStore('withdrawals', { keyPath: '_id' });
        store.createIndex('investorId', 'investorId', { unique: false });
        store.createIndex('source', 'source', { unique: false });
      }

      // 8. Owner Transactions store
      if (!db.objectStoreNames.contains('ownerTransactions')) {
        const store = db.createObjectStore('ownerTransactions', { keyPath: '_id' });
        store.createIndex('transactionDate', 'transactionDate', { unique: false });
      }

      // 9. Reports Cache store
      if (!db.objectStoreNames.contains('reportsCache')) {
        db.createObjectStore('reportsCache', { keyPath: 'key' });
      }

      // 10. Sync Queue store (stores offline mutations waiting to be synced)
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'operationId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      // 11. Metadata store (key-value store for sync timestamps, cached summaries, settings)
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'key' });
      }

      // 12. Conflicts store
      if (!db.objectStoreNames.contains('conflicts')) {
        db.createObjectStore('conflicts', { keyPath: 'operationId' });
      }

      // 13. Funding Allocations store
      if (!db.objectStoreNames.contains('fundingAllocations')) {
        const store = db.createObjectStore('fundingAllocations', { keyPath: '_id' });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('investorId', 'investorId', { unique: false });
        store.createIndex('sourceType', 'sourceType', { unique: false });
      }

      // 14. Missed Installment Events store
      if (!db.objectStoreNames.contains('missedInstallmentEvents')) {
        const store = db.createObjectStore('missedInstallmentEvents', { keyPath: '_id' });
        store.createIndex('planId', 'planId', { unique: false });
        store.createIndex('customerId', 'customerId', { unique: false });
        store.createIndex('installmentId', 'installmentId', { unique: false });
        store.createIndex('recordedDate', 'recordedDate', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });

  return dbPromise;
}

export async function put(storeName, item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(item);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putMany(storeName, items) {
  if (!items || items.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    for (const item of items) {
      if (item && (item._id || item.key || item.operationId)) {
        store.put(item);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteItem(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearStore(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function count(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([storeName], 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ---------------- Metadata Helpers ----------------

export async function getMetadata(key) {
  const res = await get('syncMetadata', key);
  return res ? res.value : null;
}

export async function setMetadata(key, value) {
  return put('syncMetadata', { key, value, updatedAt: new Date().toISOString() });
}

// ---------------- Sync Queue Helpers ----------------

export async function enqueueOperation({ type, payload, localId, operationId }) {
  const opId = operationId || localId || `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const op = {
    operationId: opId,
    type,
    payload,
    localId: localId || null,
    status: 'SAVED_LOCALLY',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };
  try {
    await put('syncQueue', op);
    return op;
  } catch (err) {
    if (err && (err.name === 'QuotaExceededError' || err.code === 22)) {
      console.error('Storage quota exceeded: Cannot persist offline mutation safely.', err);
      throw new Error('Local browser storage quota is full. Operation cannot be safely saved offline.');
    }
    throw err;
  }
}

export async function getPendingOperations() {
  const all = await getAll('syncQueue');
  return all
    .filter((op) => op.status === 'SAVED_LOCALLY' || op.status === 'SYNC_FAILED')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

export async function updateOperation(operationId, updates) {
  const op = await get('syncQueue', operationId);
  if (!op) return null;
  const updated = { ...op, ...updates };
  await put('syncQueue', updated);
  return updated;
}

export async function removeOperation(operationId) {
  return deleteItem('syncQueue', operationId);
}

// ---------------- Persistent Storage Request ----------------

export async function requestStoragePersistence() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return isPersisted;
    } catch {
      return false;
    }
  }
  return false;
}

export async function getStorageQuotaEstimate() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;
      return {
        usage,
        quota,
        percentUsed,
        isWarning: percentUsed > 80,
      };
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------- Offline Local Query Helpers ----------------

export async function queryCustomersOffline({ search, status = 'active', page = 1, limit = 20 } = {}) {
  const all = await getAll('customers');
  let filtered = all.filter((c) => !c.isDeleted);

  if (status === 'archived') {
    filtered = filtered.filter((c) => c.isArchived);
  } else if (status === 'active') {
    filtered = filtered.filter((c) => !c.isArchived);
  }

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(
      (c) =>
        (c.name && c.name.toLowerCase().includes(s)) ||
        (c.contactNumber && c.contactNumber.includes(s)) ||
        (c.cnic && c.cnic.includes(s)) ||
        (c.customerId && c.customerId.toLowerCase().includes(s))
    );
  }

  // Sort by createdAt descending
  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const data = filtered.slice(skip, skip + limit);

  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryPaymentsOffline({ page = 1, limit = 20, customerId, planId, preset, from, to } = {}) {
  const all = await getAll('payments');
  let filtered = all;

  if (customerId) {
    filtered = filtered.filter((p) => p.customerId === customerId || p.customerId?._id === customerId);
  }
  if (planId) {
    filtered = filtered.filter((p) => p.planId === planId || p.planId?._id === planId);
  }

  if (preset && preset !== 'all') {
    const now = new Date();
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const today = startOfDay(now);

    filtered = filtered.filter((p) => {
      if (!p.paymentDate) return false;
      const d = new Date(p.paymentDate);
      switch (preset) {
        case 'today':
          return d >= today && d <= endOfDay(now);
        case 'yesterday': {
          const y = new Date(today); y.setDate(y.getDate() - 1);
          return d >= y && d <= endOfDay(y);
        }
        case 'this_week': {
          const start = new Date(today); start.setDate(start.getDate() - start.getDay());
          return d >= start && d <= endOfDay(now);
        }
        case 'last_week': {
          const thisWeekStart = new Date(today); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
          const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
          const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
          return d >= lastWeekStart && d <= endOfDay(lastWeekEnd);
        }
        case 'this_month': {
          const start = new Date(now.getFullYear(), now.getMonth(), 1);
          return d >= start && d <= endOfDay(now);
        }
        case 'last_month': {
          const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const end = new Date(now.getFullYear(), now.getMonth(), 0);
          return d >= start && d <= endOfDay(end);
        }
        case 'custom': {
          if (!from || !to) return true;
          return d >= startOfDay(new Date(from)) && d <= endOfDay(new Date(to));
        }
        default:
          return true;
      }
    });
  }

  // Sort by paymentDate descending
  filtered.sort((a, b) => new Date(b.paymentDate || 0) - new Date(a.paymentDate || 0));

  const total = filtered.length;
  const skip = (page - 1) * limit;
  const data = filtered.slice(skip, skip + limit);

  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryInstallmentsOffline({ planId, customerId, status } = {}) {
  const all = await getAll('installments');
  let filtered = all;

  if (planId) {
    filtered = filtered.filter((i) => i.planId === planId || i.planId?._id === planId);
  }
  if (customerId) {
    filtered = filtered.filter((i) => i.customerId === customerId || i.customerId?._id === customerId);
  }
  if (status) {
    filtered = filtered.filter((i) => i.status === status);
  }

  filtered.sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
  return filtered;
}

export async function queryInvestorsOffline({ search, page = 1, limit = 20 } = {}) {
  const all = await getAll('investors');
  let filtered = all.filter((i) => !i.isDeleted);

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(
      (i) =>
        (i.name && i.name.toLowerCase().includes(s)) ||
        (i.investorId && i.investorId.toLowerCase().includes(s)) ||
        (i.phone && i.phone.includes(s))
    );
  }

  filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  const data = filtered.slice(skip, skip + limit);

  return {
    data,
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryInvestorTransactionsOffline({ investorId, page = 1, limit = 20 } = {}) {
  const all = await getAll('investorTransactions');
  let filtered = all;
  if (investorId) {
    filtered = filtered.filter((t) => t.investorId === investorId || t.investorId?._id === investorId);
  }
  filtered.sort((a, b) => new Date(b.transactionDate || b.createdAt || 0) - new Date(a.transactionDate || a.createdAt || 0));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  return {
    data: filtered.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryWithdrawalsOffline({ investorId, source, page = 1, limit = 20 } = {}) {
  const all = await getAll('withdrawals');
  let filtered = all;
  if (investorId) {
    filtered = filtered.filter((w) => w.investorId === investorId || w.investorId?._id === investorId);
  }
  if (source) {
    filtered = filtered.filter((w) => w.source === source);
  }
  filtered.sort((a, b) => new Date(b.withdrawalDate || b.createdAt || 0) - new Date(a.withdrawalDate || a.createdAt || 0));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  return {
    data: filtered.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryOwnerTransactionsOffline({ page = 1, limit = 20 } = {}) {
  const all = await getAll('ownerTransactions');
  const sorted = all.sort((a, b) => new Date(b.transactionDate || b.createdAt || 0) - new Date(a.transactionDate || a.createdAt || 0));
  const total = sorted.length;
  const skip = (page - 1) * limit;
  return {
    data: sorted.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function getReportOffline(reportKey) {
  const row = await get('reportsCache', reportKey);
  return row ? row.data : null;
}

export async function setReportOffline(reportKey, data) {
  return put('reportsCache', {
    key: reportKey,
    data,
    updatedAt: new Date().toISOString(),
  });
}

export async function getSettingsOffline() {
  const settings = await getMetadata('businessSettings');
  return settings || null;
}

export async function setSettingsOffline(settings) {
  return setMetadata('businessSettings', settings);
}

export async function getOwnerDataOffline() {
  return getMetadata('ownerData');
}

export async function setOwnerDataOffline(ownerData) {
  return setMetadata('ownerData', ownerData);
}

export async function getInvestorOffline(id) {
  let investor = await get('investors', id);
  if (!investor) {
    const all = await getAll('investors');
    investor = all.find((inv) => String(inv._id) === String(id) || String(inv.investorId) === String(id));
  }
  if (!investor) return null;

  const cachedSummaries = (await getMetadata('cachedInvestorSummaries')) || {};
  const invIdStr = String(investor._id);
  const cached = cachedSummaries[id] || cachedSummaries[String(id)] || cachedSummaries[invIdStr];

  // Derive metrics locally from IndexedDB tables if cached summary is absent
  const [allTx, allPlans] = await Promise.all([
    getAll('investorTransactions'),
    getAll('installmentPlans'),
  ]);

  const invTx = (allTx || []).filter((t) => String(t.investorId?._id || t.investorId) === invIdStr);
  const invPlans = (allPlans || []).filter((p) => !p.isDeleted && String(p.investorId?._id || p.investorId) === invIdStr);

  const invested = invTx.filter((t) => t.transactionType === 'INVESTMENT_IN').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const returned = invTx.filter((t) => t.transactionType === 'RETURN_TO_INVESTOR').reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const held = invested - returned;
  const deployed = invPlans.reduce((sum, p) => sum + Number(p.capitalDeployed || p.purchaseCost || 0), 0);
  const available = Math.max(0, held - deployed);

  const derivedCapital = {
    capitalHeld: held,
    customersFunded: new Set(invPlans.map((p) => String(p.customerId?._id || p.customerId))).size,
    contractsFunded: invPlans.length,
    customerCollections: invPlans.reduce((sum, p) => sum + Number(p.totalPaid || 0) + Number(p.downPayment || 0), 0),
    outstanding: invPlans.reduce((sum, p) => sum + Number(p.remainingAmount || 0), 0),
    originalCapitalInvested: invested,
    additionalCapitalAdded: 0,
    totalCapitalReturned: returned,
    capitalDeployed: deployed,
    recoveredCapital: 0,
    capitalStillDeployed: deployed,
    capitalAvailable: available,
    totalSale: invPlans.reduce((sum, p) => sum + Number(p.sellingPrice || 0), 0),
    totalCost: invPlans.reduce((sum, p) => sum + Number(p.purchaseCost || 0), 0),
    expectedProfit: invPlans.reduce((sum, p) => sum + Number(p.expectedProfit || 0), 0),
    expectedLoss: invPlans.reduce((sum, p) => sum + Number(p.expectedLoss || 0), 0),
  };

  const defaultInstallmentStats = {
    PAID: 0,
    PENDING: 0,
    OVERDUE: 0,
    MISSED: 0,
    PARTIAL: 0,
  };

  const defaultProfit = {
    investorProfitShare: 0,
    investorProfitCashWithdrawn: 0,
    investorProfitToCapital: 0,
    investorRemainingProfit: 0,
  };

  return {
    investor: cached?.investor || investor,
    capital: cached?.capital || derivedCapital,
    installmentStats: cached?.installmentStats || defaultInstallmentStats,
    profit: cached?.profit || defaultProfit,
  };
}

export async function queryPlansOffline({ customerId, investorId, status, search, page = 1, limit = 20 } = {}) {
  const all = await getAll('installmentPlans');
  let filtered = all.filter((p) => !p.isDeleted);

  if (customerId) {
    filtered = filtered.filter((p) => p.customerId === customerId || p.customerId?._id === customerId);
  }
  if (investorId) {
    filtered = filtered.filter((p) => p.investorId === investorId || p.investorId?._id === investorId);
  }
  if (status) {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        (p.contractId && p.contractId.toLowerCase().includes(s)) ||
        (p.productName && p.productName.toLowerCase().includes(s)) ||
        (p.customerId?.name && p.customerId.name.toLowerCase().includes(s))
    );
  }

  filtered.sort((a, b) => new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  return {
    data: filtered.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryOwnerFundedContractsOffline({ search, status, page = 1, limit = 20 } = {}) {
  const all = await getAll('installmentPlans');
  let filtered = all.filter((p) => !p.isDeleted && (!p.investorId || p.fundingSource === 'BUSINESS' || p.fundingSource === 'OWNER'));

  if (status) {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    filtered = filtered.filter(
      (p) =>
        (p.contractId && p.contractId.toLowerCase().includes(s)) ||
        (p.productName && p.productName.toLowerCase().includes(s)) ||
        (p.customerId?.name && p.customerId.name.toLowerCase().includes(s))
    );
  }

  filtered.sort((a, b) => new Date(b.startDate || b.createdAt || 0) - new Date(a.startDate || a.createdAt || 0));
  const total = filtered.length;
  const skip = (page - 1) * limit;
  return {
    data: filtered.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryOwnerFundedCustomersOffline({ search, page = 1, limit = 20 } = {}) {
  const [plans, customers] = await Promise.all([
    getAll('installmentPlans'),
    getAll('customers'),
  ]);

  const customerMap = new Map();
  customers.forEach((c) => customerMap.set(String(c._id), c));

  const ownerPlans = plans.filter((p) => !p.isDeleted && (!p.investorId || p.fundingSource === 'BUSINESS' || p.fundingSource === 'OWNER'));

  const grouped = new Map();
  ownerPlans.forEach((plan) => {
    const cid = String(plan.customerId?._id || plan.customerId);
    if (!grouped.has(cid)) {
      grouped.set(cid, {
        customer: customerMap.get(cid) || plan.customerId || { _id: cid, name: 'Unknown Customer' },
        contractsFunded: 0,
        deployed: 0,
        collected: 0,
        outstanding: 0,
      });
    }
    const entry = grouped.get(cid);
    entry.contractsFunded += 1;
    entry.deployed += Number(plan.purchaseCost || 0);
    entry.collected += Number(plan.totalPaid || 0) + Number(plan.downPayment || 0);
    entry.outstanding += Number(plan.remainingAmount || 0);
  });

  let rows = Array.from(grouped.values());

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    rows = rows.filter(
      (r) =>
        (r.customer?.name && r.customer.name.toLowerCase().includes(s)) ||
        (r.customer?.contactNumber && r.customer.contactNumber.includes(s)) ||
        (r.customer?.customerId && r.customer.customerId.toLowerCase().includes(s))
    );
  }

  const total = rows.length;
  const skip = (page - 1) * limit;
  return {
    data: rows.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function queryInvestorFundedCustomersOffline({ investorId, search, page = 1, limit = 20 } = {}) {
  const [plans, customers] = await Promise.all([
    getAll('installmentPlans'),
    getAll('customers'),
  ]);

  const customerMap = new Map();
  customers.forEach((c) => customerMap.set(String(c._id), c));

  const invPlans = plans.filter((p) => {
    if (p.isDeleted) return false;
    const inv = p.investorId?._id || p.investorId;
    return String(inv) === String(investorId);
  });

  const grouped = new Map();
  invPlans.forEach((plan) => {
    const cid = String(plan.customerId?._id || plan.customerId);
    if (!grouped.has(cid)) {
      grouped.set(cid, {
        customer: customerMap.get(cid) || plan.customerId || { _id: cid, name: 'Unknown Customer' },
        contractsFunded: 0,
        deployed: 0,
        collected: 0,
        outstanding: 0,
      });
    }
    const entry = grouped.get(cid);
    entry.contractsFunded += 1;
    entry.deployed += Number(plan.capitalDeployed || plan.purchaseCost || 0);
    entry.collected += Number(plan.totalPaid || 0) + Number(plan.downPayment || 0);
    entry.outstanding += Number(plan.remainingAmount || 0);
  });

  let rows = Array.from(grouped.values());

  if (search && search.trim()) {
    const s = search.toLowerCase().trim();
    rows = rows.filter(
      (r) =>
        (r.customer?.name && r.customer.name.toLowerCase().includes(s)) ||
        (r.customer?.contactNumber && r.customer.contactNumber.includes(s)) ||
        (r.customer?.customerId && r.customer.customerId.toLowerCase().includes(s))
    );
  }

  const total = rows.length;
  const skip = (page - 1) * limit;
  return {
    data: rows.slice(skip, skip + limit),
    total,
    page,
    pages: Math.ceil(total / limit) || 1,
  };
}

export async function getBootstrapManifest() {
  return (await getMetadata('bootstrapManifest')) || null;
}

export async function setBootstrapManifest(manifest) {
  return setMetadata('bootstrapManifest', manifest);
}

export async function getStorageDiagnostics() {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      const usageMB = Math.round(((estimate.usage || 0) / (1024 * 1024)) * 100) / 100;
      const quotaMB = Math.round(((estimate.quota || 0) / (1024 * 1024)) * 100) / 100;
      const percent = estimate.quota ? Math.round(((estimate.usage || 0) / estimate.quota) * 100) : 0;
      return {
        usageBytes: estimate.usage || 0,
        quotaBytes: estimate.quota || 0,
        usageMB,
        quotaMB,
        percent,
        persisted: typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : true,
      };
    } catch {
      return null;
    }
  }
  return null;
}

export async function queryFundingAllocationsOffline({ planId, investorId } = {}) {
  const all = await getAll('fundingAllocations');
  let filtered = all;
  if (planId) {
    filtered = filtered.filter((a) => String(a.planId?._id || a.planId) === String(planId));
  }
  if (investorId) {
    filtered = filtered.filter((a) => String(a.investorId?._id || a.investorId) === String(investorId));
  }
  return filtered;
}

export async function queryMissedEventsOffline({ planId, customerId } = {}) {
  const all = await getAll('missedInstallmentEvents');
  let filtered = all;
  if (planId) {
    filtered = filtered.filter((m) => String(m.planId?._id || m.planId) === String(planId));
  }
  if (customerId) {
    filtered = filtered.filter((m) => String(m.customerId?._id || m.customerId) === String(customerId));
  }
  return filtered.sort((a, b) => new Date(b.recordedDate || 0) - new Date(a.recordedDate || 0));
}

export async function deleteCustomerOffline(customerId) {
  const customer = await get('customers', customerId);
  if (customer) {
    customer.isDeleted = true;
    await put('customers', customer);
  }
}

export async function archiveCustomerOffline(customerId) {
  const customer = await get('customers', customerId);
  if (customer) {
    customer.isArchived = true;
    await put('customers', customer);
  }
}
