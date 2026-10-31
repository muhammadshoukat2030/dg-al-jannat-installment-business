import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeSyncState, triggerSync, initSyncManager, retryFailedOperations } from '../offline/syncManager';

const SyncContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  failedCount: 0,
  conflictCount: 0,
  bootstrapStatus: 'PENDING',
  bootstrapPercent: 0,
  currentStep: '',
  lastSyncTime: null,
  lastError: null,
  storageDiagnostics: null,
  triggerSync: async () => {},
  retryFailedOperations: async () => {},
});

export function SyncProvider({ children }) {
  const [syncState, setSyncState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    failedCount: 0,
    conflictCount: 0,
    bootstrapStatus: 'PENDING',
    bootstrapPercent: 0,
    currentStep: '',
    lastSyncTime: null,
    lastError: null,
    storageDiagnostics: null,
  });

  useEffect(() => {
    initSyncManager();
    if (typeof window !== 'undefined') {
      window.__ims_triggerSync = triggerSync;
      window.__ims_syncState = syncState;
    }
    const unsubscribe = subscribeSyncState((state) => {
      if (typeof window !== 'undefined') {
        window.__ims_syncState = state;
      }
      setSyncState({ ...state });
    });
    return unsubscribe;
  }, []);

  return (
    <SyncContext.Provider value={{ ...syncState, triggerSync, retryFailedOperations }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
