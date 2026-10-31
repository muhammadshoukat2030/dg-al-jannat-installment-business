/**
 * Synchronization Manager for Installment Management System 6
 * Coordinates manifest-driven initial bootstrap, delta updates, and automatic offline-to-online queue flushing.
 * Developed by SHOUKAT | 03348004300
 */

import client from '../api/client';
import {
  put,
  putMany,
  get,
  getAll,
  deleteItem,
  getMetadata,
  setMetadata,
  getPendingOperations,
  updateOperation,
  removeOperation,
  requestStoragePersistence,
  setReportOffline,
  getBootstrapManifest,
  setBootstrapManifest,
  getStorageDiagnostics,
} from './db';

// Listeners for sync state changes
const listeners = new Set();

let syncState = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  bootstrapStatus: 'PENDING', // 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'
  bootstrapPercent: 0,
  currentStep: '',
  lastSyncTime: null,
  lastError: null,
  storageDiagnostics: null,
};

let retryTimeout = null;
let retryDelay = 5000;

function scheduleRetry() {
  if (retryTimeout) clearTimeout(retryTimeout);
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  retryTimeout = setTimeout(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine && syncState.pendingCount > 0 && !syncState.isSyncing) {
      triggerSync();
    }
  }, retryDelay);
  retryDelay = Math.min(Math.round(retryDelay * 1.5), 60000);
}

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
    const allOps = (await getAll('syncQueue')) || [];
    const pending = allOps.filter((o) => o.status === 'PENDING' || o.status === 'SYNCING');
    const failed = allOps.filter((o) => o.status === 'SYNC_FAILED');
    const conflicts = (await getAll('conflicts')) || [];

    const isInitialCompleted = await getMetadata('initialSyncCompleted');
    const manifest = await getBootstrapManifest();
    let percent = 0;
    if (isInitialCompleted) {
      percent = 100;
    } else if (manifest && manifest.datasets) {
      let done = 0;
      let total = 0;
      for (const ds of Object.values(manifest.datasets)) {
        if (ds.total) {
          total += ds.total;
          done += Math.min(ds.count || 0, ds.total);
        } else if (ds.status === 'COMPLETED') {
          total += 1;
          done += 1;
        }
      }
      percent = total > 0 ? Math.round((done / total) * 100) : 0;
    }

    const storage = await getStorageDiagnostics();

    syncState = {
      ...syncState,
      pendingCount: pending.length,
      failedCount: failed.length,
      conflictCount: conflicts.length,
      bootstrapStatus: isInitialCompleted ? 'COMPLETED' : (manifest?.status || 'PENDING'),
      bootstrapPercent: percent,
      storageDiagnostics: storage,
    };
    notifyListeners();
  } catch {
    // DB not ready yet
  }
}

/**
 * Allows manual retry of failed sync queue items from the UI.
 */
export async function retryFailedOperations() {
  const allOps = (await getAll('syncQueue')) || [];
  const failedOps = allOps.filter((op) => op.status === 'SYNC_FAILED');
  for (const op of failedOps) {
    await updateOperation(op.operationId, { status: 'PENDING', lastError: null });
  }
  await refreshPendingCount();
  return triggerSync();
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
    retryDelay = 5000;
    notifyListeners();
    triggerSync();
  });

  window.addEventListener('offline', () => {
    syncState = { ...syncState, isOnline: false };
    notifyListeners();
  });

  // If online on app launch, trigger sync
  if (navigator.onLine) {
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
      currentStep: '',
    };
    await setMetadata('lastSyncTime', now);
    retryDelay = 5000;
    if (retryTimeout) clearTimeout(retryTimeout);
  } catch (err) {
    syncState = {
      ...syncState,
      isSyncing: false,
      lastError: err.message || 'Synchronization failed',
      currentStep: '',
    };
    if (typeof navigator !== 'undefined' && navigator.onLine && syncState.pendingCount > 0) {
      scheduleRetry();
    }
  } finally {
    await refreshPendingCount();
    notifyListeners();
  }
}

/**
 * Fetches remaining pages for a given module until all records are stored locally.
 * Resumes from the last confirmed cursor saved in the bootstrap manifest.
 */
async function fetchAllModulePages(moduleName, storeName, manifest, manifestKey) {
  const dataset = manifest.datasets[manifestKey] || { count: 0, total: 0, cursor: 0, status: 'PENDING' };
  let offset = dataset.cursor || 0;
  let hasMore = true;
  const limit = 200;

  while (hasMore) {
    syncState.currentStep = `Downloading ${moduleName} (${offset} records)...`;
    notifyListeners();

    const res = await client.get('/sync/bootstrap', {
      params: { module: moduleName, offset, limit },
    });

    if (res.data?.success && Array.isArray(res.data?.data)) {
      if (res.data.data.length > 0) {
        await putMany(storeName, res.data.data);
        offset += res.data.data.length;
      }
      dataset.cursor = offset;
      dataset.count = offset;
      dataset.total = res.data.total !== undefined ? res.data.total : offset;
      hasMore = res.data.hasMore === true && res.data.data.length > 0;
      if (!hasMore) {
        dataset.status = 'COMPLETED';
      } else {
        dataset.status = 'IN_PROGRESS';
      }
      manifest.datasets[manifestKey] = dataset;
      manifest.updatedAt = new Date().toISOString();
      await setBootstrapManifest(manifest);
    } else {
      dataset.status = 'FAILED';
      dataset.error = `Failed to download ${moduleName} at offset ${offset}`;
      await setBootstrapManifest(manifest);
      throw new Error(`Failed to download page for module ${moduleName} at offset ${offset}`);
    }
  }
}

/**
 * Manifest-driven initial bulk download of all business records.
 * Supports resumption on interruption without starting from 0 or duplicating records.
 * Guarantees that ALL records and required categories are fully persisted
 * before initialSyncCompleted is marked true.
 */
async function performBootstrapSync() {
  let manifest = await getBootstrapManifest();
  if (!manifest) {
    manifest = {
      version: 1,
      status: 'IN_PROGRESS',
      datasets: {
        customers: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        installmentPlans: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        installments: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        payments: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        investors: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        investorTransactions: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        withdrawals: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        ownerTransactions: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        fundingAllocations: { count: 0, total: 0, cursor: 0, status: 'PENDING' },
        settings: { status: 'PENDING' },
        ownerData: { status: 'PENDING' },
        dashboard: { status: 'PENDING' },
        reports: { status: 'PENDING' },
      },
      updatedAt: new Date().toISOString(),
    };
    await setBootstrapManifest(manifest);
  }

  // 1. Initial base package download if not completed
  const baseIncomplete =
    manifest.datasets.settings?.status !== 'COMPLETED' ||
    manifest.datasets.ownerData?.status !== 'COMPLETED' ||
    manifest.datasets.dashboard?.status !== 'COMPLETED' ||
    manifest.datasets.reports?.status !== 'COMPLETED';

  let initialData = null;
  let counts = {};

  if (baseIncomplete) {
    syncState.currentStep = 'Downloading core business datasets...';
    notifyListeners();

    const res = await client.get('/sync/bootstrap');
    if (!res.data?.success || !res.data?.data) {
      throw new Error('Bootstrap sync response was unsuccessful or empty.');
    }
    initialData = res.data.data;
    counts = res.data.counts || {};

    const {
      customers = [],
      plans = [],
      installments = [],
      payments = [],
      investors = [],
      investorTransactions = [],
      withdrawals = [],
      ownerTransactions = [],
      fundingAllocations = [],
      settings,
      ownerData,
      dashboard,
      investorSummaries,
      reports,
    } = initialData;

    // Atomically store base batch
    await Promise.all([
      putMany('customers', customers),
      putMany('installmentPlans', plans),
      putMany('installments', installments),
      putMany('payments', payments),
      putMany('investors', investors),
      putMany('investorTransactions', investorTransactions),
      putMany('withdrawals', withdrawals),
      putMany('ownerTransactions', ownerTransactions),
      putMany('fundingAllocations', fundingAllocations),
    ]);

    if (settings) {
      await setMetadata('businessSettings', settings);
      manifest.datasets.settings = { status: 'COMPLETED' };
    }
    if (ownerData) {
      await setMetadata('ownerData', ownerData);
      manifest.datasets.ownerData = { status: 'COMPLETED' };
    }
    if (investorSummaries) {
      await setMetadata('cachedInvestorSummaries', investorSummaries);
    }
    if (reports) {
      for (const [key, rows] of Object.entries(reports)) {
        await setReportOffline(key, rows);
      }
      manifest.datasets.reports = { status: 'COMPLETED' };
    }
    if (dashboard) {
      await setMetadata('cachedDashboardSummary', dashboard);
      if (dashboard.investorOverview) {
        await setMetadata('cachedInvestorOverview', dashboard.investorOverview);
      }
      manifest.datasets.dashboard = { status: 'COMPLETED' };
    }

    // Set initial cursors based on base payload
    manifest.datasets.customers = {
      count: customers.length,
      total: counts.customers || customers.length,
      cursor: customers.length,
      status: customers.length >= (counts.customers || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.installmentPlans = {
      count: plans.length,
      total: counts.plans || plans.length,
      cursor: plans.length,
      status: plans.length >= (counts.plans || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.installments = {
      count: installments.length,
      total: counts.installments || installments.length,
      cursor: installments.length,
      status: installments.length >= (counts.installments || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.payments = {
      count: payments.length,
      total: counts.payments || payments.length,
      cursor: payments.length,
      status: payments.length >= (counts.payments || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.investors = {
      count: investors.length,
      total: counts.investors || investors.length,
      cursor: investors.length,
      status: investors.length >= (counts.investors || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.investorTransactions = {
      count: investorTransactions.length,
      total: counts.investorTransactions || investorTransactions.length,
      cursor: investorTransactions.length,
      status: investorTransactions.length >= (counts.investorTransactions || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.withdrawals = {
      count: withdrawals.length,
      total: counts.withdrawals || withdrawals.length,
      cursor: withdrawals.length,
      status: withdrawals.length >= (counts.withdrawals || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.ownerTransactions = {
      count: ownerTransactions.length,
      total: counts.ownerTransactions || ownerTransactions.length,
      cursor: ownerTransactions.length,
      status: ownerTransactions.length >= (counts.ownerTransactions || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };
    manifest.datasets.fundingAllocations = {
      count: fundingAllocations.length,
      total: counts.fundingAllocations || fundingAllocations.length,
      cursor: fundingAllocations.length,
      status: fundingAllocations.length >= (counts.fundingAllocations || 0) ? 'COMPLETED' : 'IN_PROGRESS',
    };

    manifest.updatedAt = new Date().toISOString();
    await setBootstrapManifest(manifest);
  }

  // 2. Paginate remaining pages for any incomplete dataset
  const moduleMap = [
    { moduleName: 'customers', storeName: 'customers', manifestKey: 'customers' },
    { moduleName: 'plans', storeName: 'installmentPlans', manifestKey: 'installmentPlans' },
    { moduleName: 'installments', storeName: 'installments', manifestKey: 'installments' },
    { moduleName: 'payments', storeName: 'payments', manifestKey: 'payments' },
    { moduleName: 'investors', storeName: 'investors', manifestKey: 'investors' },
    { moduleName: 'investorTransactions', storeName: 'investorTransactions', manifestKey: 'investorTransactions' },
    { moduleName: 'withdrawals', storeName: 'withdrawals', manifestKey: 'withdrawals' },
    { moduleName: 'ownerTransactions', storeName: 'ownerTransactions', manifestKey: 'ownerTransactions' },
    { moduleName: 'fundingAllocations', storeName: 'fundingAllocations', manifestKey: 'fundingAllocations' },
  ];

  for (const m of moduleMap) {
    if (manifest.datasets[m.manifestKey]?.status !== 'COMPLETED') {
      await fetchAllModulePages(m.moduleName, m.storeName, manifest, m.manifestKey);
    }
  }

  // 3. Strict verification: All datasets must be confirmed COMPLETED
  const allComplete = Object.values(manifest.datasets).every((ds) => ds.status === 'COMPLETED');
  if (!allComplete) {
    manifest.status = 'IN_PROGRESS';
    await setBootstrapManifest(manifest);
    throw new Error('Bootstrap is incomplete: one or more datasets could not finish downloading.');
  }

  manifest.status = 'COMPLETED';
  manifest.completedAt = new Date().toISOString();
  await setBootstrapManifest(manifest);
  await setMetadata('initialSyncCompleted', true);
  syncState.currentStep = '';
  notifyListeners();
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
      fundingAllocations,
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
      putMany('fundingAllocations', fundingAllocations || []),
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
 * Cleans up temporary client IDs safely upon confirmation.
 */
async function pushOfflineOperations() {
  const pending = await getPendingOperations();
  if (pending.length === 0) return;

  const res = await client.post('/sync/push', { operations: pending });
  if (res.data?.success && Array.isArray(res.data?.results)) {
    for (const result of res.data.results) {
      const { operationId, status, serverRecord, type } = result;

      if (status === 'CONFIRMED') {
        const op = pending.find((p) => p.operationId === operationId);

        // Update local IndexedDB with authoritative server record & clean up temporary IDs
        if (type === 'RECORD_PAYMENT' && serverRecord) {
          if (serverRecord.payment) await put('payments', serverRecord.payment);
          if (serverRecord.installment) await put('installments', serverRecord.installment);
          if (serverRecord.plan) await put('installmentPlans', serverRecord.plan);
          if (op?.localId) await deleteItem('payments', op.localId);
          await deleteItem('payments', 'local_' + operationId);
        } else if (type === 'CREATE_CUSTOMER' && serverRecord) {
          await put('customers', serverRecord);
          if (op?.localId) await deleteItem('customers', op.localId);
          await deleteItem('customers', 'local_' + operationId);
        } else if (type === 'UPDATE_CUSTOMER' && serverRecord) {
          await put('customers', serverRecord);
        } else if (type === 'DELETE_CUSTOMER' || type === 'ARCHIVE_CUSTOMER') {
          if (type === 'ARCHIVE_CUSTOMER' && serverRecord) {
            await put('customers', serverRecord);
          } else if (op?.payload?._id || op?.payload?.id) {
            await deleteItem('customers', op.payload._id || op.payload.id);
          }
        } else if ((type === 'CREATE_INVESTOR' || type === 'UPDATE_INVESTOR') && serverRecord) {
          await put('investors', serverRecord);
          if (op?.localId) await deleteItem('investors', op.localId);
          if (op?.tempId) await deleteItem('investors', op.tempId);
          await deleteItem('investors', 'temp_' + operationId);
          await deleteItem('investors', 'local_' + operationId);
        } else if (type === 'ADD_INVESTOR_TRANSACTION' && serverRecord) {
          await put('investorTransactions', serverRecord);
          if (op?.localId) await deleteItem('investorTransactions', op.localId);
          await deleteItem('investorTransactions', 'local_' + operationId);
        } else if (type === 'RECORD_WITHDRAWAL' && serverRecord) {
          await put('withdrawals', serverRecord);
          if (op?.localId) await deleteItem('withdrawals', op.localId);
          await deleteItem('withdrawals', 'local_' + operationId);
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
        // Validation or server error -> mark failed and increment retry
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
