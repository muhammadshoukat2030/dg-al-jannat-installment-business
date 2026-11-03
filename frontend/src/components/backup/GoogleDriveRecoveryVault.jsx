import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import {
  Cloud,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  RotateCcw,
  Database,
  Layers,
  FileCheck2,
  HardDrive,
  Calendar,
  Lock,
  ExternalLink,
  ShieldCheck,
  Folder,
} from 'lucide-react';
import { backupApi } from '../../api/services';
import { formatBytes } from '../../utils/format';

export default function GoogleDriveRecoveryVault({
  status,
  onOpenRestore,
  onConnectGoogle,
}) {
  const [gdriveData, setGdriveData] = useState({
    connected: false,
    folderId: '',
    backups: [],
  });
  const [loading, setLoading] = useState(true);
  const [selectedBackupId, setSelectedBackupId] = useState(null);

  const fetchGoogleDriveBackups = useCallback(async (showToast = false) => {
    setLoading(true);
    try {
      const res = await backupApi.getGoogleDriveBackups();
      const payload = res.data;
      if (payload && payload.success) {
        const backupsList = payload.data || [];
        setGdriveData({
          connected: !!payload.connected,
          folderId: payload.folderId || '',
          backups: backupsList,
        });

        // Default selection to the newest backup if not already selected
        if (backupsList.length > 0) {
          setSelectedBackupId((prev) => (prev && backupsList.some((b) => b.fileId === prev) ? prev : backupsList[0].fileId));
        }

        if (showToast) {
          toast.success(`Fetched ${backupsList.length} backup archive(s) from Google Drive.`);
        }
      } else {
        setGdriveData({
          connected: false,
          folderId: '',
          backups: [],
        });
      }
    } catch (err) {
      console.error('Error fetching Google Drive backups:', err);
      if (showToast) {
        toast.error('Failed to fetch from Google Drive: ' + (err.response?.data?.message || err.message));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGoogleDriveBackups();
  }, [fetchGoogleDriveBackups]);

  const selectedBackup = gdriveData.backups.find((b) => b.fileId === selectedBackupId) || gdriveData.backups[0];

  function handleTriggerRestore(backupToRestore) {
    const target = backupToRestore || selectedBackup;
    if (!target) {
      toast.error('Please select a backup archive to restore.');
      return;
    }
    if (onOpenRestore) {
      onOpenRestore(target);
    }
  }

  const isConnected = gdriveData.connected || status?.googleDrive?.isConnected;
  const userEmail = status?.googleDrive?.email || 'Connected Account';

  return (
    <div className="card space-y-5 border-2 border-blue-500/20 bg-gradient-to-b from-blue-500/5 via-transparent to-transparent">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <Cloud className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Google Drive Disaster Recovery Vault
              </h3>
              {isConnected ? (
                <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Connected
                </span>
              ) : (
                <span className="badge bg-amber-500/10 text-amber-600 text-[10px] font-semibold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Not Connected
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Direct cloud disaster recovery from Google Drive folder <code className="text-primary-600">Installment-System-Backups</code>.
              Works even if database is wiped or deleted.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className="btn-secondary text-xs flex items-center gap-1.5"
            onClick={() => fetchGoogleDriveBackups(true)}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh from Google Drive
          </button>

          <button
            type="button"
            className="btn-primary text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-500/20"
            onClick={() => handleTriggerRestore(selectedBackup)}
            disabled={loading || !selectedBackup || !isConnected}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore Database from Google Drive
          </button>
        </div>
      </div>

      {/* 2. Connection Warning if disconnected */}
      {!isConnected && (
        <div className="p-3.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-500" />
            <span>
              Google Drive is currently not connected. Connect your Google account to enable automated cloud backups and 1-click disaster recovery.
            </span>
          </div>
          <button
            type="button"
            onClick={onConnectGoogle}
            className="btn-primary text-xs shrink-0 bg-amber-600 hover:bg-amber-700"
          >
            Connect Google Drive
          </button>
        </div>
      )}

      {/* 3. Selected Backup Highlight Card */}
      {selectedBackup && (
        <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700/80 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-primary-500" />
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Selected Recovery Target:
              </span>
              <span className="font-mono font-bold text-xs text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-900 px-2 py-0.5 rounded border border-gray-200 dark:border-gray-700">
                {selectedBackup.fileName}
              </span>
            </div>
            <button
              type="button"
              className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
              onClick={() => handleTriggerRestore(selectedBackup)}
            >
              <RotateCcw className="w-3 h-3" />
              Proceed with this backup →
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-0.5 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-gray-400" /> Created (PKT)
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {new Date(selectedBackup.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-0.5 flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-gray-400" /> Archive Size
              </span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">
                {formatBytes(selectedBackup.sizeBytes || 0)}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-0.5 flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Integrity
              </span>
              <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold">
                AES-256-GCM Encrypted
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-white dark:bg-gray-900/60 border border-gray-100 dark:border-gray-800">
              <span className="text-[11px] text-gray-400 block mb-0.5 flex items-center gap-1">
                <Layers className="w-3 h-3 text-primary-500" /> Data Inventory
              </span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {selectedBackup.totalCollections !== null ? (
                  `${selectedBackup.totalCollections} Collections · ${selectedBackup.totalDocuments} Docs`
                ) : (
                  <span className="text-gray-400 italic">Inspect on restore</span>
                )}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Google Drive Archives Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-800 dark:text-gray-200">
              Available Cloud Backups in Google Drive ({gdriveData.backups.length})
            </span>
            {gdriveData.folderId && (
              <span className="text-[11px] text-gray-400 font-mono hidden sm:inline">
                Folder: {gdriveData.folderId}
              </span>
            )}
          </div>
          <span className="text-[11px] text-gray-500">
            Sorted newest first · Click row or radio to select
          </span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-theme-muted text-xs border border-dashed rounded-lg">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-primary-500" />
            Querying Google Drive API for backup archives...
          </div>
        ) : gdriveData.backups.length === 0 ? (
          <div className="p-8 text-center text-theme-muted text-xs border border-dashed rounded-lg">
            <Cloud className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            <p className="font-medium text-gray-600 dark:text-gray-400">
              No backup archives found in your Google Drive folder.
            </p>
            <p className="text-[11px] text-gray-400 mt-1">
              Create a new backup now using the "Create Backup Now" action above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 dark:border-gray-700/60 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700/60 text-theme-muted font-medium">
                <tr>
                  <th className="py-2.5 px-3 w-10 text-center">Select</th>
                  <th className="py-2.5 px-3">Backup Archive</th>
                  <th className="py-2.5 px-3">Date (PKT)</th>
                  <th className="py-2.5 px-3">Size</th>
                  <th className="py-2.5 px-3">Collections</th>
                  <th className="py-2.5 px-3">Documents</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {gdriveData.backups.map((b) => {
                  const isSelected = b.fileId === selectedBackupId;
                  return (
                    <tr
                      key={b.fileId}
                      onClick={() => setSelectedBackupId(b.fileId)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-500/10 dark:bg-blue-500/15'
                          : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="radio"
                          name="selectedGdriveBackup"
                          checked={isSelected}
                          onChange={() => setSelectedBackupId(b.fileId)}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                      </td>

                      <td className="py-2.5 px-3 font-mono font-medium text-gray-800 dark:text-gray-200">
                        <div className="flex items-center gap-1.5">
                          <Cloud className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span className="truncate max-w-[220px]" title={b.fileName}>
                            {b.fileName}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {new Date(b.createdAt).toLocaleString('en-PK', {
                          timeZone: 'Asia/Karachi',
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </td>

                      <td className="py-2.5 px-3 font-mono text-gray-700 dark:text-gray-300">
                        {formatBytes(b.sizeBytes || 0)}
                      </td>

                      <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono">
                        {b.totalCollections !== null ? b.totalCollections : '—'}
                      </td>

                      <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono">
                        {b.totalDocuments !== null ? b.totalDocuments : '—'}
                      </td>

                      <td className="py-2.5 px-3">
                        <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold flex items-center gap-1 w-fit">
                          <CheckCircle2 className="w-3 h-3" /> Cloud Safe
                        </span>
                      </td>

                      <td className="py-2.5 px-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="btn-secondary text-[11px] py-1 px-2.5 flex items-center gap-1 ml-auto text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                          onClick={() => handleTriggerRestore(b)}
                        >
                          <RotateCcw className="w-3 h-3" />
                          Restore
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
