import React, { useState } from 'react';
import toast from 'react-hot-toast';
import {
  RotateCcw,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  FlaskConical,
  Database,
} from 'lucide-react';
import { backupApi } from '../../api/services';

export default function RestoreModal({ backup, onClose, onSuccess }) {
  const [mode, setMode] = useState('test'); // 'test' or 'production'
  const [confirmText, setConfirmText] = useState('');
  const [restoring, setRestoring] = useState(false);
  const [restoreReport, setRestoreReport] = useState(null);

  if (!backup) return null;

  async function handleExecuteRestore() {
    setRestoring(true);
    setRestoreReport(null);

    try {
      if (mode === 'test') {
        const res = await backupApi.testRestore(backup.backupId);
        setRestoreReport(res.data.data);
        if (res.data.data?.success) {
          toast.success('Isolated test restore succeeded! 100% of data verified.');
        } else {
          toast.error('Test restore reported discrepancies. Check details below.');
        }
      } else {
        if (confirmText !== 'RESTORE-DATABASE') {
          toast.error("Please type 'RESTORE-DATABASE' to confirm.");
          setRestoring(false);
          return;
        }

        const res = await backupApi.productionRestore(backup.backupId, confirmText);
        setRestoreReport(res.data.data);
        toast.success('Production database successfully restored and verified!');
        if (onSuccess) onSuccess();
      }
    } catch (err) {
      toast.error('Restoration failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-xl p-0 overflow-hidden shadow-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-amber-500" />
            <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100">
              DATABASE DISASTER RECOVERY & RESTORATION
            </h2>
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
          {/* Selected Backup Info */}
          <div className="p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg space-y-1.5 border border-gray-200 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Selected Backup ID:</span>
              <span className="font-mono font-bold text-gray-800 dark:text-gray-200">{backup.backupId}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Archive Filename:</span>
              <span className="font-mono text-gray-600 dark:text-gray-400">{backup.filename}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500 font-medium">Contents:</span>
              <span className="font-semibold text-gray-800 dark:text-gray-200">
                {backup.totalCollections || 0} Collections · {backup.totalDocuments || 0} Documents
              </span>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className={`p-3 rounded-lg border text-left transition-all ${
                mode === 'test'
                  ? 'border-primary-500 bg-primary-50/20 dark:bg-primary-950/20 text-primary-900 dark:text-primary-100 ring-2 ring-primary-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40'
              }`}
              onClick={() => {
                setMode('test');
                setRestoreReport(null);
              }}
              disabled={restoring}
            >
              <div className="flex items-center gap-1.5 font-bold mb-1">
                <FlaskConical className="w-4 h-4 text-primary-500" />
                Isolated Test Restore
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">
                Restores into an isolated test database to verify 100% of data. Zero risk to production.
              </p>
            </button>

            <button
              type="button"
              className={`p-3 rounded-lg border text-left transition-all ${
                mode === 'production'
                  ? 'border-red-500 bg-red-50/20 dark:bg-red-950/20 text-red-900 dark:text-red-100 ring-2 ring-red-500/20'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/40'
              }`}
              onClick={() => {
                setMode('production');
                setRestoreReport(null);
              }}
              disabled={restoring}
            >
              <div className="flex items-center gap-1.5 font-bold text-red-600 dark:text-red-400 mb-1">
                <Database className="w-4 h-4 text-red-500" />
                Production Recovery
              </div>
              <p className="text-[11px] text-gray-500 leading-tight">
                Reconstructs live MongoDB collections and documents from this backup.
              </p>
            </button>
          </div>

          {/* Mode Warning & Input */}
          {mode === 'test' ? (
            <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 space-y-1">
              <p className="font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" /> Safe Verification Mode
              </p>
              <p className="text-[11px] text-blue-800 dark:text-blue-300">
                This will decrypt the backup archive, restore all collections and records into a temporary isolated
                test database, compare document counts and indexes against the manifest, and display the result.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="p-3 bg-red-50 dark:bg-red-950/40 rounded-lg border border-red-200 dark:border-red-800 text-red-900 dark:text-red-200 space-y-1.5">
                <p className="font-bold flex items-center gap-1.5 text-red-600 dark:text-red-400">
                  <ShieldAlert className="w-4 h-4" /> PRODUCTION DISASTER RECOVERY WARNING
                </p>
                <p className="text-[11px] text-red-800 dark:text-red-300 leading-relaxed">
                  This action will restore your production database to the exact state saved in this backup. An
                  automatic pre-restore safety snapshot will be created before proceeding.
                </p>
              </div>

              <div>
                <label className="text-gray-700 dark:text-gray-300 font-semibold block mb-1">
                  Type <span className="font-mono text-red-600 font-bold">RESTORE-DATABASE</span> to confirm:
                </label>
                <input
                  type="text"
                  className="input font-mono uppercase text-xs"
                  placeholder="RESTORE-DATABASE"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  disabled={restoring}
                />
              </div>
            </div>
          )}

          {/* Restore Report Output */}
          {restoreReport && (
            <div
              className={`p-3 rounded-lg border space-y-2 ${
                restoreReport.success
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                {restoreReport.success ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Restoration Verified: 100% of Collections & Records Reconstructed</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>Restoration Finished with Discrepancies</span>
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px] text-gray-700 dark:text-gray-300 font-mono">
                <div>Target DB: {restoreReport.targetDbName}</div>
                <div>Collections: {restoreReport.restoredCollections}</div>
                <div>Documents: {restoreReport.restoredDocuments}</div>
                {restoreReport.safetyBackupId && (
                  <div>Safety Backup: {restoreReport.safetyBackupId}</div>
                )}
              </div>

              {restoreReport.discrepancies && restoreReport.discrepancies.length > 0 && (
                <div className="mt-2 text-red-600 text-[10px] space-y-1">
                  {restoreReport.discrepancies.map((d, i) => (
                    <div key={i}>• {d}</div>
                  ))}
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
              mode === 'production' ? 'btn-danger' : 'btn-primary'
            } text-xs flex items-center gap-1.5`}
            onClick={handleExecuteRestore}
            disabled={restoring || (mode === 'production' && confirmText !== 'RESTORE-DATABASE')}
          >
            {restoring ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                Restoring Database...
              </>
            ) : mode === 'production' ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                Authorize Production Restore
              </>
            ) : (
              <>
                <FlaskConical className="w-3.5 h-3.5" />
                Execute Test Restore
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
