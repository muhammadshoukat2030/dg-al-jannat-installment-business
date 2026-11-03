import React, { useState } from 'react';
import {
  ShieldCheck,
  Download,
  RotateCcw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Cloud,
  HardDrive,
  Filter,
  FileCheck,
} from 'lucide-react';
import { formatDate, formatBytes } from '../../utils/format';

export default function BackupHistoryTable({
  backups = [],
  loading,
  onVerify,
  onDownload,
  onOpenRestore,
}) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [verifyingId, setVerifyingId] = useState(null);

  const filtered = backups.filter((b) => {
    if (filterType !== 'all' && b.type !== filterType) return false;
    if (search.trim()) {
      const s = search.toLowerCase().trim();
      const matchId = b.backupId && b.backupId.toLowerCase().includes(s);
      const matchName = b.filename && b.filename.toLowerCase().includes(s);
      if (!matchId && !matchName) return false;
    }
    return true;
  });

  async function handleVerify(id) {
    setVerifyingId(id);
    try {
      await onVerify(id);
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <div className="card p-0 space-y-3 overflow-hidden">
      {/* Header and Filter Controls */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200">
            BACKUP VAULT HISTORY & DISASTER RECOVERY ARCHIVES
          </h2>
          <p className="text-xs text-theme-muted mt-0.5">
            Cryptographically encrypted (AES-256-GCM) database archives with full collections and indexes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-400" />
            <input
              type="text"
              className="input pl-8 py-1.5 text-xs w-48"
              placeholder="Search backup ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <select
            className="input py-1.5 text-xs w-auto"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="MANUAL">Manual</option>
            <option value="SCHEDULED_DAILY">Daily Scheduled</option>
            <option value="SCHEDULED_WEEKLY">Weekly Scheduled</option>
            <option value="SCHEDULED_MONTHLY">Monthly Scheduled</option>
            <option value="SAFETY_PRE_RESTORE">Safety Snapshot</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2.5 font-medium">Backup ID / Archive</th>
              <th className="px-4 py-2.5 font-medium">Created (PKT)</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 font-medium">Size</th>
              <th className="px-4 py-2.5 font-medium">Contents</th>
              <th className="px-4 py-2.5 font-medium">Location</th>
              <th className="px-4 py-2.5 font-medium">Integrity</th>
              <th className="px-4 py-2.5 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  Loading backup history...
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No backups found in vault. Click "Create Backup Now" above to generate your first encrypted backup.
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((b) => {
                const isGdrive = !!b.googleDrive?.fileId;
                const isLocal = !!b.isLocalKept;

                return (
                  <tr
                    key={b._id || b.backupId}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
                  >
                    {/* Backup ID */}
                    <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate max-w-[170px]" title={b.backupId}>
                          {b.backupId}
                        </span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-sans block truncate max-w-[170px]">
                        {b.filename}
                      </span>
                    </td>

                    {/* Created */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {new Date(b.createdAt).toLocaleString('en-GB', {
                        timeZone: 'Asia/Karachi',
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          b.type === 'MANUAL'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
                            : b.type === 'SAFETY_PRE_RESTORE'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
                            : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {b.type.replace('_', ' ')}
                      </span>
                    </td>

                    {/* Size */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-mono">
                      {formatBytes ? formatBytes(b.encryptedSizeBytes) : `${Math.round(b.encryptedSizeBytes / 1024)} KB`}
                    </td>

                    {/* Contents */}
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      <span className="font-semibold">{b.totalCollections || 0}</span> cols ·{' '}
                      <span className="font-semibold">{b.totalDocuments || 0}</span> docs
                    </td>

                    {/* Location */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {isGdrive && (
                          <span
                            className="inline-flex items-center gap-0.5 text-blue-600 dark:text-blue-400 font-medium"
                            title="Stored in Google Drive folder: Installment-System-Backups"
                          >
                            <Cloud className="w-3.5 h-3.5" /> Cloud
                          </span>
                        )}
                        {isLocal && (
                          <span
                            className="inline-flex items-center gap-0.5 text-gray-500 dark:text-gray-400 font-medium ml-1"
                            title="Stored locally in backend/backups"
                          >
                            <HardDrive className="w-3.5 h-3.5" /> Local
                          </span>
                        )}
                        {!isGdrive && !isLocal && (
                          <span className="text-gray-400 italic">Archived</span>
                        )}
                      </div>
                    </td>

                    {/* Integrity */}
                    <td className="px-4 py-3">
                      {b.verificationStatus === 'VERIFIED' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                        </span>
                      ) : b.verificationStatus === 'FAILED' ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-medium text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5" /> Corrupted
                        </span>
                      ) : (
                        <span className="text-gray-400 italic text-[11px]">Unverified</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="btn-secondary py-1 px-2 text-[11px] flex items-center gap-1"
                          onClick={() => handleVerify(b.backupId)}
                          disabled={verifyingId === b.backupId}
                          title="Verify SHA-256 and AES-GCM tag"
                        >
                          <FileCheck className="w-3 h-3 text-primary-500" />
                          {verifyingId === b.backupId ? 'Checking...' : 'Verify'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary py-1 px-2 text-[11px] flex items-center gap-1"
                          onClick={() => onDownload(b.backupId, b.filename)}
                          title="Download encrypted .imsbak file"
                        >
                          <Download className="w-3 h-3 text-gray-600 dark:text-gray-300" />
                          Download
                        </button>
                        <button
                          type="button"
                          className="btn-secondary py-1 px-2 text-[11px] text-amber-600 dark:text-amber-400 hover:text-amber-700 flex items-center gap-1"
                          onClick={() => onOpenRestore(b)}
                          title="Restore to test or production database"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore...
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
