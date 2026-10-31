import { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, AlertCircle, CheckCircle2, HardDrive, RotateCcw } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export default function SyncStatusIndicator() {
  const {
    isOnline,
    isSyncing,
    pendingCount,
    failedCount,
    bootstrapStatus,
    bootstrapPercent,
    currentStep,
    lastSyncTime,
    lastError,
    storageDiagnostics,
    triggerSync,
    retryFailedOperations,
  } = useSync();

  const [showDetails, setShowDetails] = useState(false);
  const [retrying, setRetrying] = useState(false);

  function formatSyncTime(timeStr) {
    if (!timeStr) return 'Never';
    const diff = Math.floor((Date.now() - new Date(timeStr).getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timeStr).toLocaleDateString();
  }

  async function handleRetry(e) {
    e.stopPropagation();
    setRetrying(true);
    try {
      if (typeof retryFailedOperations === 'function') {
        await retryFailedOperations();
      }
    } finally {
      setRetrying(false);
    }
  }

  const isBootstrapComplete = bootstrapStatus === 'COMPLETED';

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
            : failedCount > 0 || lastError
            ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/30'
            : isBootstrapComplete
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
            : 'bg-primary-500/10 text-primary-600 dark:text-primary-400 border border-primary-500/20'
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
            <span className="hidden xs:inline">
              {!isBootstrapComplete ? `Syncing ${bootstrapPercent}%` : 'Syncing'}
            </span>
          </>
        ) : failedCount > 0 || lastError ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
            <span className="hidden xs:inline">
              {failedCount > 0 ? `${failedCount} Failed` : 'Sync Error'}
            </span>
          </>
        ) : !isBootstrapComplete ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-primary-500" />
            <span className="hidden xs:inline">{bootstrapPercent}% Cached</span>
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

      {/* Floating details tooltip on hover / click */}
      {showDetails && (
        <div
          onMouseEnter={() => setShowDetails(true)}
          onMouseLeave={() => setShowDetails(false)}
          className="absolute right-0 top-full mt-2 w-72 p-3 bg-theme-card border border-theme-border rounded-xl shadow-xl text-xs z-50 transition-all space-y-2"
        >
          <div className="flex items-center justify-between pb-1.5 border-b border-theme-border">
            <span className="font-semibold text-theme-text flex items-center gap-1.5">
              {isOnline ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
              {isOnline ? 'Online Mode' : 'Offline Mode'}
            </span>
            <span className="text-[10px] text-theme-muted">
              {formatSyncTime(lastSyncTime)}
            </span>
          </div>

          <div className="space-y-1.5 text-theme-muted">
            <div className="flex justify-between items-center">
              <span>Database Replica:</span>
              <span className="font-medium text-theme-text flex items-center gap-1">
                {isBootstrapComplete ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Complete (100%)
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-3 h-3 text-primary-500 animate-spin" />
                    {bootstrapPercent}% Loaded
                  </>
                )}
              </span>
            </div>

            {currentStep && (
              <p className="text-[10px] text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-950/40 p-1.5 rounded truncate">
                {currentStep}
              </p>
            )}

            <div className="flex justify-between items-center">
              <span>Pending changes:</span>
              <strong className={pendingCount > 0 ? 'text-[#6C4CF1] font-bold' : 'text-theme-text'}>
                {pendingCount}
              </strong>
            </div>

            {failedCount > 0 && (
              <div className="flex justify-between items-center text-red-500 font-medium">
                <span>Failed operations:</span>
                <div className="flex items-center gap-1.5">
                  <span>{failedCount}</span>
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={retrying || !isOnline}
                    className="p-1 rounded bg-red-100 dark:bg-red-950/50 hover:bg-red-200 text-red-700 dark:text-red-300 text-[10px] flex items-center gap-0.5"
                    title="Retry failed operations now"
                  >
                    <RotateCcw className={`w-2.5 h-2.5 ${retrying ? 'animate-spin' : ''}`} />
                    Retry
                  </button>
                </div>
              </div>
            )}

            {storageDiagnostics && (
              <div className="flex justify-between items-center pt-1 border-t border-theme-border/60 text-[11px]">
                <span className="flex items-center gap-1">
                  <HardDrive className="w-3 h-3 text-theme-muted" /> Local Cache:
                </span>
                <span className="text-theme-text font-medium">
                  {storageDiagnostics.usageMB} MB ({storageDiagnostics.percent}% of quota)
                </span>
              </div>
            )}

            {lastError && (
              <p className="text-red-500 text-[11px] pt-1 border-t border-theme-border">
                {lastError}
              </p>
            )}

            {isOnline && (
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => triggerSync()}
                  disabled={isSyncing}
                  className="w-full btn-secondary text-xs py-1 flex items-center justify-center gap-1"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Now'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
