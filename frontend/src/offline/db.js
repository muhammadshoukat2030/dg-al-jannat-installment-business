/**
 * IndexedDB abstraction for Installment Management System 6
 * Provides durable local storage for customers, plans, installments, payments,
 * investors, metadata, and the offline operations queue.
 */

const DB_NAME = 'ims_offline_db';
const DB_VERSION = 1;

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

      // 6. Sync Queue store (stores offline mutations waiting to be synced)
      if (!db.objectStoreNames.contains('syncQueue')) {
        const store = db.createObjectStore('syncQueue', { keyPath: 'operationId' });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }

      // 7. Metadata store (key-value store for sync timestamps, cached summaries)
      if (!db.objectStoreNames.contains('syncMetadata')) {
        db.createObjectStore('syncMetadata', { keyPath: 'key' });
      }

      // 8. Conflicts store
      if (!db.objectStoreNames.contains('conflicts')) {
        db.createObjectStore('conflicts', { keyPath: 'operationId' });
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

export async function enqueueOperation({ type, payload, localId }) {
  const operationId = `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const op = {
    operationId,
    type,
    payload,
    localId: localId || null,
    status: 'SAVED_LOCALLY',
    retryCount: 0,
    createdAt: new Date().toISOString(),
  };
  await put('syncQueue', op);
  return op;
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
        await navigator.storage.persist();
      }
    } catch {
      // Browser refused or unsupported; safely ignored
    }
  }
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

export async function queryPaymentsOffline({ page = 1, limit = 20, customerId, planId } = {}) {
  const all = await getAll('payments');
  let filtered = all;

  if (customerId) {
    filtered = filtered.filter((p) => p.customerId === customerId || p.customerId?._id === customerId);
  }
  if (planId) {
    filtered = filtered.filter((p) => p.planId === planId || p.planId?._id === planId);
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
