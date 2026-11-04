import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { backupApi } from '../../api/services';
import BackupOverview from './BackupOverview';
import BackupHistoryTable from './BackupHistoryTable';
import BackupScheduleSettings from './BackupScheduleSettings';
import RestoreModal from './RestoreModal';
import GoogleConnectModal from './GoogleConnectModal';
import GoogleDriveRecoveryVault from './GoogleDriveRecoveryVault';
import GoogleDriveRestoreModal from './GoogleDriveRestoreModal';

export default function BackupManager() {
  const [status, setStatus] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  // Modals state
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [gdriveRestoreTarget, setGdriveRestoreTarget] = useState(null);
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [statusRes, historyRes] = await Promise.all([
        backupApi.getStatus(),
        backupApi.getHistory({ limit: 50 }),
      ]);
      setStatus(statusRes.data.data);
      setBackups(historyRes.data.data || []);
    } catch (err) {
      toast.error('Failed to load backup data: ' + (err.response?.data?.message || err.message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();

    // Check for Google OAuth callback parameters in URL query string
    const params = new URLSearchParams(window.location.search);
    if (params.get('gdrive') === 'connected') {
      toast.success('Google Drive successfully connected!');
      // Clean query parameter without page reload
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=backup');
      loadData();
    } else if (params.get('error')) {
      toast.error('Google authorization error: ' + params.get('error'));
      window.history.replaceState({}, document.title, window.location.pathname + '?tab=backup');
    }
  }, [loadData]);

  async function handleCreateBackup() {
    setCreating(true);
    try {
      const res = await backupApi.create();
      toast.success(
        res.data.data?.googleDriveUploaded
          ? 'Backup created and uploaded to Google Drive!'
          : 'Encrypted backup created successfully.'
      );
      await loadData();
    } catch (err) {
      toast.error('Backup creation failed: ' + (err.response?.data?.message || err.message));
    } finally {
      setCreating(false);
    }
  }

  async function handleVerifyBackup(backupId) {
    try {
      const res = await backupApi.verify(backupId);
      toast.success('Backup archive verified: SHA-256 and AES-GCM tags match.');
      await loadData();
      return res.data;
    } catch (err) {
      toast.error('Verification failed: ' + (err.response?.data?.message || err.message));
      throw err;
    }
  }

  function handleDownloadBackup(backupId, filename) {
    backupApi.download(backupId, filename);
  }

  function handleDownloadKit() {
    backupApi.downloadEmergencyKit();
    toast.success('Emergency Recovery Guide downloaded. For security, raw master keys can only be exported via the server terminal.');
  }

  async function handleDisconnectGoogle() {
    if (!window.confirm('Are you sure you want to disconnect Google Drive? Backups will no longer upload to the cloud.')) {
      return;
    }

    try {
      await backupApi.disconnectGoogleDrive();
      toast.success('Google Drive disconnected.');
      await loadData();
    } catch (err) {
      toast.error('Failed to disconnect: ' + err.message);
    }
  }

  async function handleSaveSettings(data) {
    setSavingSettings(true);
    try {
      await backupApi.updateSettings(data);
      await loadData();
    } finally {
      setSavingSettings(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Overview & Action Bar */}
      <BackupOverview
        status={status}
        loading={loading}
        creating={creating}
        onRefresh={loadData}
        onCreateBackup={handleCreateBackup}
        onConnectGoogle={() => setIsGoogleModalOpen(true)}
        onDisconnectGoogle={handleDisconnectGoogle}
        onDownloadKit={handleDownloadKit}
      />

      {/* 2. Automated Google Drive Disaster Recovery Vault */}
      <GoogleDriveRecoveryVault
        status={status}
        onOpenRestore={(backup) => setGdriveRestoreTarget(backup)}
        onConnectGoogle={() => setIsGoogleModalOpen(true)}
      />

      {/* 3. Local / Historic Backup Archives Table */}
      <BackupHistoryTable
        backups={backups}
        loading={loading}
        onVerify={handleVerifyBackup}
        onDownload={handleDownloadBackup}
        onOpenRestore={(backup) => setRestoreTarget(backup)}
      />

      {/* 4. Automatic Schedule & Retention Settings */}
      <BackupScheduleSettings
        schedule={status?.schedule}
        retention={status?.retention}
        onSave={handleSaveSettings}
        saving={savingSettings}
      />

      {/* 5. Google Drive Cloud Restore Modal */}
      {gdriveRestoreTarget && (
        <GoogleDriveRestoreModal
          backup={gdriveRestoreTarget}
          onClose={() => setGdriveRestoreTarget(null)}
          onSuccess={() => {
            setGdriveRestoreTarget(null);
            loadData();
          }}
        />
      )}

      {/* 6. Local / Legacy Restore Modal */}
      {restoreTarget && (
        <RestoreModal
          backup={restoreTarget}
          onClose={() => setRestoreTarget(null)}
          onSuccess={loadData}
        />
      )}

      {/* 7. Google Drive Connect Modal */}
      <GoogleConnectModal
        isOpen={isGoogleModalOpen}
        onClose={() => setIsGoogleModalOpen(false)}
        isConfigured={status?.googleDrive?.isOAuthConfigured}
      />
    </div>
  );
}
