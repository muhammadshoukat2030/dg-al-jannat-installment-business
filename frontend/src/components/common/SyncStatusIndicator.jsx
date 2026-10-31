import { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export default function SyncStatusIndicator() {
  const { isOnline, isSyncing, pendingCount, lastSyncTime, lastError, triggerSync } = useSync();
  const [showDetails, setShowDetails] = useState(false);

  // Formatted last sync label
  function formatSyncTime(timeStr) {
    if (!timeStr) return 'Never';
    const diff = Math.floor((Date.now() - new Date(timeStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timeStr).toLocaleDateString();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          if (isOnline && !isSyncing) triggerSync();
          else setShowDetails((prev) => !prev);
        }}
        onMouseEnter={() => setShowDetails(true)}
        onMouseLeave={() => setShowDetails(false)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
          !isOnline
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30'
            : isSyncing
            ? 'bg-[#6C4CF1]/10 text-[#6C4CF1] dark:text-emerald-400 border border-[#6C4CF1]/30 animate-pulse'
            : lastError
            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
        }`}
        title={isOnline ? 'Click to synchronize now' : 'Working offline. Changes are saved locally.'}
      >
        {!isOnline ? (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-500" />
            <span className="hidden xs:inline">Offline</span>
            {pendingCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-amber-500 text-white text-[10px] rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </>
        ) : isSyncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#6C4CF1] dark:text-emerald-400" />
            <span className="hidden xs:inline">Syncing</span>
          </>
        ) : lastError ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden xs:inline">Sync Failed</span>
          </>
        ) : (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
            <span className="hidden xs:inline">Online</span>
            {pendingCount > 0 && (
              <span className="ml-0.5 px-1.5 py-0.2 bg-[#6C4CF1] text-white text-[10px] rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </>
        )}
      </button>

      {/* Floating details tooltip on hover */}
      {showDetails && (
        <div className="absolute right-0 top-full mt-2 w-56 p-2.5 bg-theme-card border border-theme-border rounded-xl shadow-lg text-xs z-50 pointer-events-none transition-all">
          <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-theme-border">
            <span className="font-semibold text-theme-text flex items-center gap-1.5">
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
              {isOnline ? 'Online Mode' : 'Offline Mode'}
            </span>
            <span className="text-[10px] text-theme-muted">
              {formatSyncTime(lastSyncTime)}
            </span>
          </div>

          <div className="space-y-1 text-theme-muted">
            <p className="flex justify-between">
              <span>Pending changes:</span>
              <strong className={pendingCount > 0 ? 'text-[#6C4CF1] font-bold' : 'text-theme-text'}>
                {pendingCount}
              </strong>
            </p>
            <p className="flex justify-between">
              <span>Local storage:</span>
              <span className="text-emerald-500 font-medium">IndexedDB Ready</span>
            </p>
            {lastError && (
              <p className="text-red-500 text-[11px] mt-1 pt-1 border-t border-theme-border">
                {lastError}
              </p>
            )}
            {isOnline && (
              <p className="text-[10px] text-theme-muted italic pt-1 text-center">
                Click pill anytime to sync immediately
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
