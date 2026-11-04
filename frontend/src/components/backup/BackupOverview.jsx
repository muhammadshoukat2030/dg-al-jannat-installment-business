import React from 'react';
import {
  Database,
  Cloud,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ShieldCheck,
  KeyRound,
  HardDrive,
  Download,
  PlusCircle,
  RefreshCw,
  LogOut,
  Folder,
} from 'lucide-react';
import { formatBytes } from '../../utils/format';

export default function BackupOverview({
  status,
  loading,
  creating,
  onRefresh,
  onCreateBackup,
  onConnectGoogle,
  onDisconnectGoogle,
  onDownloadKit,
}) {
  if (loading && !status) {
    return (
      <div className="card p-6 text-center text-theme-muted">
        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-500" />
        Loading backup & recovery overview...
      </div>
    );
  }

  const db = status?.database || {};
  const gdrive = status?.googleDrive || {};
  const sched = status?.schedule || {};
  const sec = status?.security || {};
  const stats = status?.stats || {};

  return (
    <div className="space-y-4">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 dark:bg-gray-800/40 p-3 rounded-lg border border-gray-200 dark:border-gray-700/60">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Quick Actions</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={onRefresh}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={onDownloadKit}
          >
            <KeyRound className="w-3.5 h-3.5 text-amber-500" />
            Recovery Guide
          </button>
          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5"
            onClick={onCreateBackup}
            disabled={creating}
          >
            {creating ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Backing Up...
              </>
            ) : (
              <>
                <PlusCircle className="w-3.5 h-3.5" />
                Create Backup Now
              </>
            )}
          </button>
        </div>
      </div>

      {/* Grid of Key Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Database Connection */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-theme-muted uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-4 h-4 text-primary-500" /> MongoDB Database
            </span>
            <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Online
            </span>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900 dark:text-gray-100 font-mono truncate">
              {db.name || 'installment_management'}
            </p>
            <p className="text-xs text-theme-muted mt-0.5">
              {db.totalCollections || 0} Collections · {db.totalDocuments || 0} Documents
            </p>
          </div>
        </div>

        {/* 2. Google Drive Cloud Vault */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-theme-muted uppercase tracking-wider flex items-center gap-1.5">
              <Cloud className="w-4 h-4 text-blue-500" /> Google Drive
            </span>
            {gdrive.isConnected ? (
              <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Connected
              </span>
            ) : (
              <span className="badge bg-amber-500/10 text-amber-600 text-[10px] font-semibold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Disconnected
              </span>
            )}
          </div>
          <div>
            {gdrive.isConnected ? (
              <>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate" title={gdrive.email}>
                  {gdrive.email}
                </p>
                <p className="text-xs text-theme-muted mt-0.5 flex items-center gap-1">
                  <Folder className="w-3 h-3 text-amber-500" /> {gdrive.folderName}
                </p>
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center text-[11px]">
                  <span className="text-gray-400">100% Free Personal Drive</span>
                  <button
                    type="button"
                    className="text-red-500 hover:text-red-700 flex items-center gap-1"
                    onClick={onDisconnectGoogle}
                  >
                    <LogOut className="w-3 h-3" /> Disconnect
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-500 mt-1">
                  Connect your dedicated Gmail account for 100% free cloud backup storage.
                </p>
                <button
                  type="button"
                  className="mt-2 text-xs text-primary-600 hover:underline font-medium flex items-center gap-1"
                  onClick={onConnectGoogle}
                >
                  <Cloud className="w-3.5 h-3.5" /> Connect Google Account
                </button>
              </>
            )}
          </div>
        </div>

        {/* 3. Automatic Scheduling */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-theme-muted uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-purple-500" /> Scheduler
            </span>
            {sched.isEnabled ? (
              <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
                Active (2:00 AM PKT)
              </span>
            ) : (
              <span className="badge bg-gray-500/10 text-gray-500 text-[10px]">
                Disabled
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
              {sched.isEnabled ? 'Automatic Daily & Weekly' : 'Manual Trigger Only'}
            </p>
            <p className="text-xs text-theme-muted mt-0.5">
              Timezone: {sched.timezone || 'Asia/Karachi'}
            </p>
            {sched.lastRunAt && (
              <p className="text-[11px] text-gray-400 mt-1">
                Last: {new Date(sched.lastRunAt).toLocaleDateString()} ({sched.lastRunStatus})
              </p>
            )}
          </div>
        </div>

        {/* 4. Security & Encryption */}
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-theme-muted uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Encryption
            </span>
            <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
              AES-256-GCM
            </span>
          </div>
          <div>
            <p className="text-xs text-theme-muted">Key Fingerprint:</p>
            <p className="text-xs font-mono font-bold text-gray-800 dark:text-gray-200 mt-0.5">
              {sec.keyFingerprint || 'key_configured'}
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              {stats.totalBackups || 0} Backups stored · {formatBytes ? formatBytes(stats.totalStorageBytes || 0) : `${Math.round((stats.totalStorageBytes || 0) / 1024)} KB`}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
