/**
 * Synchronization Manager for Installment Management System 6
 * Coordinates initial bootstrap, delta updates, and automatic offline-to-online queue flushing.
 */

import client from '../api/client';
import {
  put,
  putMany,
  get,
  getAll,
  getMetadata,
  setMetadata,
  getPendingOperations,
  updateOperation,
  removeOperation,
  requestStoragePersistence,
  setReportOffline,
} from './db';

// Listeners for sync state changes
const listeners = new Set();

let syncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncTime: null,
  lastError: null,
};

function notifyListeners() {
  listeners.forEach((fn) => {
    try {
      fn(syncState);
    } catch {
      // Ignored
    }
  });
}

export function subscribeSyncState(fn) {
  listeners.add(fn);
  fn(syncState);
  return () => listeners.delete(fn);
}

export function getSyncState() {
  return syncState;
}

export async function refreshPendingCount() {
  try {
    const pending = await getPendingOperations();
    syncState = { ...syncState, pendingCount: pending.length };
    notifyListeners();
  } catch {
    // DB not ready yet
  }
}

/**
 * Initializes listeners, persistent storage, and checks initial sync status.
 */
export async function initSyncManager() {
  await requestStoragePersistence();

  // Load last sync time from metadata
  const lastTime = await getMetadata('lastSyncTime');
  if (lastTime) {
    syncState.lastSyncTime = lastTime;
  }

  await refreshPendingCount();

  // Online / offline window listeners
  window.addEventListener('online', () => {
    syncState = { ...syncState, isOnline: true };
    notifyListeners();
    triggerSync();
  });

  window.addEventListener('offline', () => {
    syncState = { ...syncState, isOnline: false };
    notifyListeners();
  });

  // If online on app launch, trigger sync
  if (navigator.onLine) {
    // Non-blocking initial sync
    setTimeout(() => {
      triggerSync();
    }, 1000);
  }
}

/**
 * Main synchronization routine:
 * 1. Flushes pending offline mutations (push)
 * 2. Fetches latest server updates (delta or bootstrap)
 */
export async function triggerSync() {
  if (syncState.isSyncing) return;
  if (!navigator.onLine) {
    await refreshPendingCount();
    return;
  }

  // Check auth token before syncing
  const token = localStorage.getItem('ims_token') || localStorage.getItem('token');
  if (!token) return;

  syncState = { ...syncState, isSyncing: true, lastError: null };
  notifyListeners();

  try {
    // Step 1: Push offline operations
    await pushOfflineOperations();

    // Step 2: Pull updates
    const initialCompleted = await getMetadata('initialSyncCompleted');
    if (!initialCompleted) {
      await performBootstrapSync();
    } else {
      await performDeltaSync();
    }

    const now = new Date().toISOString();
    syncState = {
      ...syncState,
      isSyncing: false,
      lastSyncTime: now,
      lastError: null,
    };
    await setMetadata('lastSyncTime', now);
  } catch (err) {
    syncState = {
      ...syncState,
      isSyncing: false,
      lastError: err.message || 'Synchronization failed',
    };
  } finally {
    await refreshPendingCount();
    notifyListeners();
  }
}

/**
 * Initial bulk download of essential business records for offline enablement.
 */
async function performBootstrapSync() {
  const res = await client.get('/sync/bootstrap');
  if (res.data?.success && res.data?.data) {
    const {
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
      settings,
      ownerData,
      dashboard,
      investorSummaries,
      reports,
    } = res.data.data;

    await Promise.all([
      putMany('customers', customers || []),
      putMany('installmentPlans', plans || []),
      putMany('installments', installments || []),
      putMany('payments', payments || []),
      putMany('investors', investors || []),
      putMany('investorTransactions', investorTransactions || []),
      putMany('withdrawals', withdrawals || []),
      putMany('ownerTransactions', ownerTransactions || []),
    ]);

    if (settings) await setMetadata('businessSettings', settings);
    if (ownerData) await setMetadata('ownerData', ownerData);
    if (investorSummaries) await setMetadata('cachedInvestorSummaries', investorSummaries);
    if (reports) {
      for (const [key, rows] of Object.entries(reports)) {
        await setReportOffline(key, rows);
      }
    }
    if (dashboard) {
      await setMetadata('cachedDashboardSummary', dashboard);
      if (dashboard.investorOverview) {
        await setMetadata('cachedInvestorOverview', dashboard.investorOverview);
      }
    }
    await setMetadata('initialSyncCompleted', true);
  }
}

/**
 * Incremental synchronization for fresh data since last sync timestamp.
 */
async function performDeltaSync() {
  const since = await getMetadata('lastSyncTime');
  if (!since) {
    return performBootstrapSync();
  }

  const res = await client.get('/sync/delta', { params: { since } });
  if (res.data?.success && res.data?.data) {
    const {
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
      settings,
      ownerData,
      dashboard,
      investorSummaries,
      reports,
    } = res.data.data;

    await Promise.all([
      putMany('customers', customers || []),
      putMany('installmentPlans', plans || []),
      putMany('installments', installments || []),
      putMany('payments', payments || []),
      putMany('investors', investors || []),
      putMany('investorTransactions', investorTransactions || []),
      putMany('withdrawals', withdrawals || []),
      putMany('ownerTransactions', ownerTransactions || []),
    ]);

    if (settings) await setMetadata('businessSettings', settings);
    if (ownerData) await setMetadata('ownerData', ownerData);
    if (investorSummaries) await setMetadata('cachedInvestorSummaries', investorSummaries);
    if (reports) {
      for (const [key, rows] of Object.entries(reports)) {
        await setReportOffline(key, rows);
      }
    }
    if (dashboard) {
      await setMetadata('cachedDashboardSummary', dashboard);
      if (dashboard.investorOverview) {
        await setMetadata('cachedInvestorOverview', dashboard.investorOverview);
      }
    }
  }
}

/**
 * Sends pending operations to the server and applies server-confirmed records locally.
 */
async function pushOfflineOperations() {
  const pending = await getPendingOperations();
  if (pending.length === 0) return;

  const res = await client.post('/sync/push', { operations: pending });
  if (res.data?.success && Array.isArray(res.data?.results)) {
    for (const result of res.data.results) {
      const { operationId, status, serverRecord, type } = result;

      if (status === 'CONFIRMED') {
        // Update local IndexedDB with authoritative server record
        if (type === 'RECORD_PAYMENT' && serverRecord) {
          if (serverRecord.payment) await put('payments', serverRecord.payment);
          if (serverRecord.installment) await put('installments', serverRecord.installment);
          if (serverRecord.plan) await put('installmentPlans', serverRecord.plan);
        } else if (type === 'CREATE_CUSTOMER' && serverRecord) {
          await put('customers', serverRecord);
        } else if (type === 'UPDATE_CUSTOMER' && serverRecord) {
          await put('customers', serverRecord);
        } else if ((type === 'CREATE_INVESTOR' || type === 'UPDATE_INVESTOR') && serverRecord) {
          await put('investors', serverRecord);
        } else if (type === 'ADD_INVESTOR_TRANSACTION' && serverRecord) {
          await put('investorTransactions', serverRecord);
        } else if (type === 'RECORD_WITHDRAWAL' && serverRecord) {
          await put('withdrawals', serverRecord);
        }

        // Successfully confirmed by server -> Remove from queue
        await removeOperation(operationId);
      } else if (status === 'CONFLICT') {
        // Save to conflicts store for review, mark operation as CONFLICT
        await put('conflicts', {
          operationId,
          result,
          savedAt: new Date().toISOString(),
        });
        await updateOperation(operationId, { status: 'CONFLICT_REVIEW_NEEDED' });
      } else {
        // Temporary failure -> mark failed and increment retry
        const op = pending.find((p) => p.operationId === operationId);
        await updateOperation(operationId, {
          status: 'SYNC_FAILED',
          retryCount: (op?.retryCount || 0) + 1,
          lastError: result.error || 'Server rejected operation',
        });
      }
    }
  }
}
