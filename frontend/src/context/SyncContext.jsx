import { createContext, useContext, useEffect, useState } from 'react';
import { subscribeSyncState, triggerSync, initSyncManager } from '../offline/syncManager';

const SyncContext = createContext({
  isOnline: true,
  isSyncing: false,
  pendingCount: 0,
  lastSyncTime: null,
  lastError: null,
  triggerSync: async () => {},
});

export function SyncProvider({ children }) {
  const [syncState, setSyncState] = useState({
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    isSyncing: false,
    pendingCount: 0,
    lastSyncTime: null,
    lastError: null,
  });

  useEffect(() => {
    initSyncManager();
    const unsubscribe = subscribeSyncState((state) => {
      setSyncState({ ...state });
    });
    return unsubscribe;
  }, []);

  return (
    <SyncContext.Provider value={{ ...syncState, triggerSync }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  return useContext(SyncContext);
}
