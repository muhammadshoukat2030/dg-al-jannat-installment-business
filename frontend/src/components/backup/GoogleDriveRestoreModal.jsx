import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  RotateCcw,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  FlaskConical,
  Database,
  Layers,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { backupApi } from '../../api/services';

const BUSINESS_COLLECTIONS = [
  'customers',
  'installmentplans',
  'installments',
  'payments',
  'investors',
  'investortransactions',
  'ownertransactions',
  'fundingallocations',
  'profitdistributions',
  'withdrawals',
  'businesssettings',
  'admins',
];

export default function GoogleDriveRestoreModal({ backup, onClose, onSuccess }) {
  const [mode, setMode] = useState('complete'); // 'complete' or 'selected'
  const [isTest, setIsTest] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [inspecting, setInspecting] = useState(true);
  const [manifestData, setManifestData] = useState(null);
  const [selectedCols, setSelectedCols] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState(null);

  // Inspect the backup file on mount to extract full collection inventory
  useEffect(() => {
    if (!backup?.fileId) return;
    setInspecting(true);
    backupApi
      .inspectGoogleDriveBackup(backup.fileId)
      .then((res) => {
        const data = res.data?.data;
        setManifestData(data);
        if (data?.collections && data.collections.length > 0) {
          // Default selected collections to all collections
          setSelectedCols(data.collections.map((c) => c.name));
        }
      })
      .catch((err) => {
        toast.error('Failed to inspect backup manifest: ' + (err.response?.data?.message || err.message));
      })
      .finally(() => setInspecting(false));
  }, [backup]);

  if (!backup) return null;

  function toggleCollection(name) {
    setSelectedCols((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function selectAll() {
    if (manifestData?.collections) {
      setSelectedCols(manifestData.collections.map((c) => c.name));
    }
  }

  function selectBusinessOnly() {
    if (manifestData?.collections) {
      setSelectedCols(
        manifestData.collections
          .map((c) => c.name)
          .filter((name) => BUSINESS_COLLECTIONS.includes(name))
      );
    }
  }

  function clearSelection() {
    setSelectedCols([]);
  }

  async function handleExecuteRestore() {
    if (mode === 'selected' && selectedCols.length === 0) {
      toast.error('Please select at least one collection to restore.');
      return;
    }

    if (mode === 'complete' && !isTest && confirmText !== 'RESTORE-DATABASE') {
      toast.error("Please type 'RESTORE-DATABASE' to confirm complete production recovery.");
      return;
    }

    setRestoring(true);
    setRestoreReport(null);

    try {
      const payload = {
        mode,
        selectedCollections: mode === 'selected' ? selectedCols : [],
        confirmation: confirmText,
        isTest,
      };

      const res = await backupApi.restoreGoogleDriveBackup(backup.fileId, payload);
      setRestoreReport(res.data.data);

      if (res.data?.success) {
        toast.success(
          isTest
            ? 'Isolated test restore succeeded! Parity verified.'
            : 'Database restoration from Google Drive completed successfully!'
        );
        // Keep modal open so the user can inspect the verification report and metrics
      } else {
        toast.error('Restoration completed with discrepancies. See report below.');
      }
    } catch (err) {
      toast.error('Restoration failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-2xl p-0 overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/40">
          <div className="flex items-center gap-2">
            <Cloud className="w-5 h-5 text-blue-500" />
            <div>
              <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                Google Drive Database Disaster Recovery
              </h2>
              <p className="text-[11px] text-gray-500">
                Restore directly from encrypted cloud archive ({backup.fileName})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1"
            disabled={restoring}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs">
          {/* Backup Info & Target Card */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg space-y-2 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-gray-500">Backup File:</span>{' '}
                <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{backup.fileName}</span>
              </div>
              <div>
                <span className="text-gray-500">Backup Date:</span>{' '}
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {new Date(backup.createdAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })} (PKT)
                </span>
              </div>
              <div>
                <span className="text-gray-500">Target Database:</span>{' '}
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {isTest ? 'installment_management_test_recovery' : 'installment_management3'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Total Size:</span>{' '}
                <span className="font-mono text-gray-800 dark:text-gray-200">
                  {Math.round((backup.sizeBytes || 0) / 1024)} KB
                </span>
              </div>
            </div>

            {inspecting ? (
              <div className="pt-2 text-center text-theme-muted flex items-center justify-center gap-1.5 text-[11px]">
                <RefreshCw className="w-3 h-3 animate-spin text-primary-500" />
                Inspecting archive manifest & verifying cryptographic signatures...
              </div>
            ) : manifestData ? (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center text-[11px]">
                <span className="text-gray-600 dark:text-gray-300">
                  Contents: <strong>{manifestData.totalCollections} Collections</strong> ·{' '}
                  <strong>{manifestData.totalDocuments} Documents</strong>
                </span>
                <span className="badge bg-emerald-500/10 text-emerald-600 font-semibold flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> AES-256-GCM Verified
                </span>
              </div>
            ) : null}
          </div>

          {/* Mode Selector */}
          <div>
            <label className="font-semibold text-gray-700 dark:text-gray-300 block mb-2">
              Select Recovery Option:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('complete')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === 'complete'
                    ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500 text-blue-900 dark:text-blue-100'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Database className="w-4 h-4 text-blue-500" />
                  Option B: Complete Database
                </div>
                <p className="text-[11px] text-gray-500">
                  Reconstructs all 17 collections from Google Drive. Ideal if database was deleted or corrupted.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('selected')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  mode === 'selected'
                    ? 'border-purple-500 bg-purple-500/10 ring-1 ring-purple-500 text-purple-900 dark:text-purple-100'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                <div className="flex items-center gap-2 font-bold mb-1">
                  <Layers className="w-4 h-4 text-purple-500" />
                  Option A: Selected Collections
                </div>
                <p className="text-[11px] text-gray-500">
                  Restore only specific collections (e.g. Customers, Payments) without touching others.
                </p>
              </button>
            </div>
          </div>

          {/* Option A: Selective Collection Checkboxes */}
          {mode === 'selected' && (
            <div className="p-3 bg-purple-500/5 border border-purple-500/20 rounded-lg space-y-3">
              <div className="flex flex-wrap justify-between items-center gap-2 border-b border-purple-500/10 pb-2">
                <span className="font-bold text-gray-800 dark:text-gray-200 text-xs">
                  Choose Collections to Restore ({selectedCols.length} selected):
                </span>
                <div className="flex items-center gap-2 text-[11px]">
                  <button type="button" onClick={selectBusinessOnly} className="text-primary-600 hover:underline">
                    Business Only
                  </button>
                  <span>·</span>
                  <button type="button" onClick={selectAll} className="text-primary-600 hover:underline">
                    Select All
                  </button>
                  <span>·</span>
                  <button type="button" onClick={clearSelection} className="text-gray-500 hover:underline">
                    Clear
                  </button>
                </div>
              </div>

              {manifestData?.collections && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                  {manifestData.collections.map((col) => {
                    const isChecked = selectedCols.includes(col.name);
                    return (
                      <label
                        key={col.name}
                        className={`flex items-center justify-between p-2 rounded border cursor-pointer transition-all ${
                          isChecked
                            ? 'bg-white dark:bg-gray-800 border-purple-300 dark:border-purple-700 shadow-sm'
                            : 'border-gray-200 dark:border-gray-700/60 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <input
                            type="checkbox"
                            className="rounded text-purple-600 focus:ring-purple-500"
                            checked={isChecked}
                            onChange={() => toggleCollection(col.name)}
                          />
                          <span className="font-mono font-medium truncate">{col.name}</span>
                        </div>
                        <span className="badge bg-gray-100 dark:bg-gray-800 text-[10px] text-gray-500 font-mono">
                          {col.documentCount} docs
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-gray-500">
                Note: Only the selected collections will be dropped and restored. Unselected existing collections in your
                database will remain completely untouched.
              </p>
            </div>
          )}

          {/* Test Dry-Run Option */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5">
            <FlaskConical className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-gray-800 dark:text-gray-200">
                <input
                  type="checkbox"
                  checked={isTest}
                  onChange={(e) => setIsTest(e.target.checked)}
                  className="rounded text-amber-600"
                />
                Run as Isolated Test Restore (Safe Dry-Run)
              </label>
              <p className="text-[11px] text-gray-500">
                Restores into an isolated test database (<code>installment_management_test_recovery</code>) to verify data
                parity without replacing any production data.
              </p>
            </div>
          </div>

          {/* Complete Production Confirmation Input */}
          {mode === 'complete' && !isTest && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg space-y-2">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold">
                <AlertTriangle className="w-4 h-4" />
                <span>Production Complete Restore Safety Confirmation</span>
              </div>
              <p className="text-[11px] text-gray-600 dark:text-gray-300">
                If the database contains recoverable records, an automatic pre-restore safety snapshot will be created
                first. To authorize complete restoration, type <strong>RESTORE-DATABASE</strong> below:
              </p>
              <input
                type="text"
                placeholder="Type RESTORE-DATABASE"
                className="input font-mono text-center tracking-wider text-xs"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
              />
            </div>
          )}

          {/* Post-Restoration Detailed Summary */}
          {restoreReport && (
            <div
              className={`p-3 rounded-lg border space-y-2 animate-fade-in ${
                restoreReport.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs">
                {restoreReport.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-emerald-800 dark:text-emerald-200">
                      Disaster Recovery Succeeded With 100% Data Parity!
                    </span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-red-600" />
                    <span className="text-red-800 dark:text-red-200">Restoration Completed with Discrepancies</span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-gray-700 dark:text-gray-300">
                <div>Target DB: {restoreReport.targetDbName}</div>
                <div>Collections Restored: {restoreReport.totalRestoredCollections || restoreReport.restoredCollections?.length}</div>
                <div>Documents Restored: {restoreReport.restoredDocuments}</div>
                {restoreReport.safetyBackupId && <div>Safety Snapshot: {restoreReport.safetyBackupId}</div>}
              </div>

              {restoreReport.discrepancies && restoreReport.discrepancies.length > 0 && (
                <div className="mt-2 text-red-600 text-[10px] space-y-1">
                  {restoreReport.discrepancies.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
                </div>
              )}

              {restoreReport.success && !isTest && (
                <div className="pt-2 border-t border-emerald-200 dark:border-emerald-800 flex justify-end">
                  <button
                    type="button"
                    className="btn-primary text-xs flex items-center gap-1.5"
                    onClick={() => window.location.reload()}
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Reload Application Data & Dashboard
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 dark:border-gray-800 flex justify-end gap-2 bg-gray-50 dark:bg-gray-800/40">
          <button type="button" className="btn-secondary text-xs" onClick={onClose} disabled={restoring}>
            Cancel
          </button>
          <button
            type="button"
            className={`${
              mode === 'complete' && !isTest ? 'btn-danger' : 'btn-primary'
            } text-xs flex items-center gap-1.5`}
            onClick={handleExecuteRestore}
            disabled={
              restoring ||
              inspecting ||
              (mode === 'complete' && !isTest && confirmText !== 'RESTORE-DATABASE') ||
              (mode === 'selected' && selectedCols.length === 0)
            }
          >
            {restoring ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Recovering from Google Drive...
              </>
            ) : isTest ? (
              <>
                <FlaskConical className="w-3.5 h-3.5" />
                Execute Isolated Test Restore
              </>
            ) : mode === 'selected' ? (
              <>
                <Layers className="w-3.5 h-3.5" />
                Restore {selectedCols.length} Selected Collection(s)
              </>
            ) : (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                Authorize Complete Database Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
