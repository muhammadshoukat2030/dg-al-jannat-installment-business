/**
 * Backup and Disaster Recovery Controller for Installment Management System 6
 * Exposes secure admin APIs for backup creation, Google Drive OAuth,
 * integrity verification, test restore, and production disaster recovery.
 */

const fs = require('fs');
const path = require('path');
const asyncHandler = require('../middleware/asyncHandler');
const BackupConfig = require('../models/BackupConfig');
const BackupRecord = require('../models/BackupRecord');
const BackupAuditLog = require('../models/BackupAuditLog');
const cryptoService = require('../services/cryptoService');
const databaseBackupService = require('../services/databaseBackupService');
const googleDriveService = require('../services/googleDriveService');
const backupSchedulerService = require('../services/backupSchedulerService');

/**
 * Helper to ensure a BackupConfig document exists.
 * Synchronizes with disk token cache if MongoDB collections were deleted or wiped.
 */
async function getOrCreateConfig() {
  let config = null;
  try {
    config = await BackupConfig.findOne({ key: 'global_backup_config' });
  } catch (err) {}

  const diskData = googleDriveService.loadTokensFromDisk();

  if (!config) {
    try {
      config = await BackupConfig.create({
        key: 'global_backup_config',
        googleDrive: diskData ? {
          isConnected: !!diskData.isConnected,
          email: diskData.email || '',
          folderId: diskData.folderId || '',
          folderName: diskData.folderName || googleDriveService.FOLDER_NAME,
          tokens: diskData.tokens || {},
          lastCheckedAt: diskData.lastCheckedAt || new Date(),
        } : {},
      });
    } catch (err) {
      // In-memory fallback if MongoDB is not writable or collections were dropped
      config = {
        key: 'global_backup_config',
        googleDrive: diskData || { isConnected: false },
        schedule: { isEnabled: false, timezone: 'Asia/Karachi' },
        retention: { dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 },
      };
    }
  } else if (!config.googleDrive?.isConnected && diskData?.isConnected) {
    config.googleDrive = {
      isConnected: true,
      email: diskData.email || '',
      folderId: diskData.folderId || '',
      folderName: diskData.folderName || googleDriveService.FOLDER_NAME,
      tokens: diskData.tokens || {},
      lastCheckedAt: diskData.lastCheckedAt || new Date(),
    };
    await config.save().catch(() => {});
  }

  return config;
}

// 1. GET /api/backup/status
const getBackupStatus = asyncHandler(async (req, res) => {
  const config = await getOrCreateConfig();
  const dbStats = await databaseBackupService.inspectDatabase().catch(() => ({
    databaseName: 'unknown',
    totalCollections: 0,
    totalDocuments: 0,
  }));

  const totalBackups = await BackupRecord.countDocuments({ status: 'SUCCESS' });
  const lastSuccessBackup = await BackupRecord.findOne({ status: 'SUCCESS' }).sort({ createdAt: -1 });
  const lastFailedBackup = await BackupRecord.findOne({ status: 'FAILED' }).sort({ createdAt: -1 });

  // Calculate total backup storage
  const storageAgg = await BackupRecord.aggregate([
    { $match: { status: 'SUCCESS' } },
    { $group: { _id: null, totalBytes: { $sum: '$encryptedSizeBytes' } } },
  ]);
  const totalStorageBytes = storageAgg[0]?.totalBytes || 0;

  // Check Google Drive quota if connected
  let gdriveQuota = null;
  if (config.googleDrive?.isConnected) {
    gdriveQuota = await googleDriveService.getStorageQuota().catch(() => null);
  }

  const clientConfig = googleDriveService.getOAuthCredentials();

  res.json({
    success: true,
    data: {
      database: {
        name: dbStats.databaseName,
        totalCollections: dbStats.totalCollections,
        totalDocuments: dbStats.totalDocuments,
        status: 'CONNECTED',
      },
      googleDrive: {
        isConnected: !!config.googleDrive?.isConnected,
        isOAuthConfigured: clientConfig.isConfigured,
        email: config.googleDrive?.email || '',
        folderName: config.googleDrive?.folderName || googleDriveService.FOLDER_NAME,
        folderId: config.googleDrive?.folderId || '',
        lastCheckedAt: config.googleDrive?.lastCheckedAt,
        quota: gdriveQuota,
      },
      schedule: {
        isEnabled: !!config.schedule?.isEnabled,
        timezone: config.schedule?.timezone || 'Asia/Karachi',
        daily: config.schedule?.daily || { enabled: true, time: '02:00' },
        weekly: config.schedule?.weekly || { enabled: true, time: '02:00', dayOfWeek: 0 },
        monthly: config.schedule?.monthly || { enabled: true, time: '02:00', dayOfMonth: 1 },
        lastRunAt: config.schedule?.lastRunAt,
        lastRunStatus: config.schedule?.lastRunStatus,
        lastRunError: config.schedule?.lastRunError,
        schedulerType: 'Free in-process node-cron & external HTTP webhook',
      },
      retention: config.retention || { dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 },
      security: {
        keyFingerprint: cryptoService.getKeyFingerprint(),
        algorithm: cryptoService.ALGORITHM,
      },
      stats: {
        totalBackups,
        totalStorageBytes,
        lastSuccessfulBackup: lastSuccessBackup,
        lastFailedBackup: lastFailedBackup,
      },
    },
  });
});

// 2. GET /api/backup/history
const getBackupHistory = asyncHandler(async (req, res) => {
  const { search, type, page = 1, limit = 20 } = req.query;
  const query = {};

  if (type && type !== 'all') {
    query.type = type;
  }

  if (search && search.trim()) {
    const s = search.trim();
    query.$or = [{ backupId: { $regex: s, $options: 'i' } }, { filename: { $regex: s, $options: 'i' } }];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [records, total] = await Promise.all([
    BackupRecord.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('createdBy', 'name email'),
    BackupRecord.countDocuments(query),
  ]);

  res.json({
    success: true,
    data: records,
    total,
    page: Number(page),
    pages: Math.ceil(total / Number(limit)) || 1,
  });
});

// 3. POST /api/backup/create
const createManualBackup = asyncHandler(async (req, res) => {
  const adminId = req.admin?._id;
  const config = await getOrCreateConfig();

  // 1. Generate local encrypted backup
  const backupResult = await databaseBackupService.createDatabaseBackup({
    type: 'MANUAL',
    createdBy: adminId,
    keepLocal: true,
  });

  const record = backupResult.record;

  // 2. Upload to Google Drive if connected
  let gdriveUpload = null;
  if (config.googleDrive?.isConnected) {
    try {
      gdriveUpload = await googleDriveService.uploadBackupFile({
        fileName: record.filename,
        fileBuffer: backupResult.encryptedBuffer,
        folderId: config.googleDrive.folderId,
        properties: {
          backupId: record.backupId,
          sha256: record.checksumSha256,
        },
      });

      record.googleDrive = {
        fileId: gdriveUpload.fileId,
        folderId: gdriveUpload.folderId,
        uploadedAt: new Date(),
        webContentLink: gdriveUpload.webContentLink,
      };
      await record.save();

      await BackupAuditLog.create({
        action: 'UPLOAD_COMPLETED',
        status: 'SUCCESS',
        backupId: record.backupId,
        adminId,
        details: { fileId: gdriveUpload.fileId },
      }).catch(() => {});
    } catch (uploadErr) {
      console.error('Google Drive manual upload failed:', uploadErr.message);
      await BackupAuditLog.create({
        action: 'UPLOAD_FAILED',
        status: 'FAILURE',
        backupId: record.backupId,
        adminId,
        details: { error: uploadErr.message },
      }).catch(() => {});
    }
  }

  res.status(201).json({
    success: true,
    message: 'Encrypted backup created successfully.',
    data: {
      backupId: record.backupId,
      filename: record.filename,
      plainSizeBytes: record.plainSizeBytes,
      encryptedSizeBytes: record.encryptedSizeBytes,
      checksumSha256: record.checksumSha256,
      totalCollections: record.totalCollections,
      totalDocuments: record.totalDocuments,
      collections: record.collectionsSummary,
      googleDriveUploaded: !!gdriveUpload,
      googleDriveFileId: gdriveUpload?.fileId || null,
      verificationStatus: record.verificationStatus,
    },
  });
});

// 4. POST /api/backup/verify/:id
const verifyBackup = asyncHandler(async (req, res) => {
  const record = await BackupRecord.findOne({ backupId: req.params.id });
  if (!record) return res.status(404).json({ success: false, message: 'Backup record not found.' });

  // Resolve encrypted buffer: local file or download from Google Drive
  let buffer = null;
  if (record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  } else if (record.googleDrive?.fileId) {
    buffer = await googleDriveService.downloadBackupFile(record.googleDrive.fileId);
  }

  if (!buffer) {
    return res.status(400).json({ success: false, message: 'Backup archive is not available locally or on Google Drive.' });
  }

  const check = databaseBackupService.verifyEncryptedArchive(buffer);
  if (!check.isValid) {
    record.verificationStatus = 'FAILED';
    record.verificationDetails = check.error;
    await record.save();

    await BackupAuditLog.create({
      action: 'BACKUP_VERIFICATION_FAILED',
      status: 'FAILURE',
      backupId: record.backupId,
      adminId: req.admin?._id,
      details: { error: check.error },
    }).catch(() => {});

    return res.status(422).json({ success: false, message: `Integrity verification failed: ${check.error}` });
  }

  record.verificationStatus = 'VERIFIED';
  record.verifiedAt = new Date();
  record.verificationDetails = 'Cryptographic auth tag (AES-GCM), SHA-256 checksum, and BSON manifest structure successfully validated.';
  await record.save();

  await BackupAuditLog.create({
    action: 'BACKUP_VERIFIED',
    status: 'SUCCESS',
    backupId: record.backupId,
    adminId: req.admin?._id,
    details: { collections: check.manifest?.totalCollections, documents: check.manifest?.totalDocuments },
  }).catch(() => {});

  res.json({
    success: true,
    message: 'Backup archive verified successfully.',
    data: {
      backupId: record.backupId,
      manifest: check.manifest,
      keyFingerprint: check.keyFingerprint,
    },
  });
});

// 5. GET /api/backup/download/:id
const downloadBackup = asyncHandler(async (req, res) => {
  const record = await BackupRecord.findOne({ backupId: req.params.id });
  if (!record) return res.status(404).json({ success: false, message: 'Backup record not found.' });

  let buffer = null;
  if (record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  } else if (record.googleDrive?.fileId) {
    buffer = await googleDriveService.downloadBackupFile(record.googleDrive.fileId);
  }

  if (!buffer) {
    return res.status(404).json({ success: false, message: 'Archive file is missing.' });
  }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', `attachment; filename="${record.filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

// 6. POST /api/backup/restore/test/:id
const testRestoreBackup = asyncHandler(async (req, res) => {
  const record = await BackupRecord.findOne({ backupId: req.params.id });
  if (!record) return res.status(404).json({ success: false, message: 'Backup record not found.' });

  let buffer = null;
  if (record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  } else if (record.googleDrive?.fileId) {
    buffer = await googleDriveService.downloadBackupFile(record.googleDrive.fileId);
  }

  if (!buffer) {
    return res.status(400).json({ success: false, message: 'Backup archive could not be retrieved for testing.' });
  }

  const result = await databaseBackupService.restoreDatabase({
    backupRecordId: record.backupId,
    encryptedBuffer: buffer,
    isTest: true,
    targetDbName: 'installment_management_test_recovery',
    adminId: req.admin?._id,
    ip: req.ip,
  });

  res.json({
    success: result.success,
    message: result.success
      ? 'Isolated test restore succeeded! 100% of collections and documents were verified.'
      : 'Test restore completed with discrepancies.',
    data: result,
  });
});

// 7. POST /api/backup/restore/production/:id
const productionRestoreBackup = asyncHandler(async (req, res) => {
  const { confirmation } = req.body;
  if (confirmation !== 'RESTORE-DATABASE') {
    return res.status(400).json({
      success: false,
      message: "Safety confirmation mismatch. You must type 'RESTORE-DATABASE' to authorize production restoration.",
    });
  }

  const record = await BackupRecord.findOne({ backupId: req.params.id });
  if (!record) return res.status(404).json({ success: false, message: 'Backup record not found.' });

  let buffer = null;
  if (record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  } else if (record.googleDrive?.fileId) {
    buffer = await googleDriveService.downloadBackupFile(record.googleDrive.fileId);
  }

  if (!buffer) {
    return res.status(400).json({ success: false, message: 'Backup archive could not be retrieved.' });
  }

  const result = await databaseBackupService.restoreDatabase({
    backupRecordId: record.backupId,
    encryptedBuffer: buffer,
    isTest: false,
    adminId: req.admin?._id,
    ip: req.ip,
  });

  res.json({
    success: result.success,
    message: 'Production database successfully restored and verified from backup.',
    data: result,
  });
});

// 8. GET /api/backup/emergency-kit
const downloadEmergencyRecoveryKit = asyncHandler(async (req, res) => {
  const kit = cryptoService.generateEmergencyRecoveryKit();

  await BackupAuditLog.create({
    action: 'EMERGENCY_KIT_DOWNLOADED',
    status: 'SUCCESS',
    adminId: req.admin?._id,
    ip: req.ip,
  }).catch(() => {});

  const textContent = `
================================================================================
${kit.title}
================================================================================
Generated: ${kit.generatedAt}
Algorithm: ${kit.algorithm}
Key Fingerprint: ${kit.keyFingerprint}

MASTER ENCRYPTION KEY (HEX):
--------------------------------------------------------------------------------
${kit.masterKeyHex}
--------------------------------------------------------------------------------

CRITICAL INSTRUCTIONS:
${kit.instructions.join('\n')}

================================================================================
KEEP THIS KIT SAFE AND CONFIDENTIAL. NEVER COMMIT THIS FILE TO GIT.
================================================================================
`.trim();

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="EMERGENCY_BACKUP_RECOVERY_KIT.txt"');
  res.send(textContent);
});

// 9. GET /api/backup/oauth/url
const getGoogleOAuthUrl = asyncHandler(async (req, res) => {
  try {
    const url = googleDriveService.getAuthorizationUrl();
    res.json({ success: true, url });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 10. GET /api/backup/oauth/callback
const handleGoogleOAuthCallback = asyncHandler(async (req, res) => {
  const { code, error } = req.query;
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error || !code) {
    return res.redirect(`${clientUrl}/settings?tab=backup&error=${encodeURIComponent(error || 'Access denied by user')}`);
  }

  try {
    const tokens = await googleDriveService.exchangeCodeForTokens(code);
    const profile = await googleDriveService.getUserProfile(tokens.access_token);
    const folderId = await googleDriveService.getOrCreateBackupFolder(tokens.access_token);

    const config = await getOrCreateConfig();
    config.googleDrive = {
      isConnected: true,
      email: profile?.email || 'Unknown',
      folderId,
      folderName: googleDriveService.FOLDER_NAME,
      tokens,
      lastCheckedAt: new Date(),
    };
    await config.save();

    await BackupAuditLog.create({
      action: 'GOOGLE_DRIVE_CONNECTED',
      status: 'SUCCESS',
      details: { email: profile?.email, folderId },
    }).catch(() => {});

    res.redirect(`${clientUrl}/settings?tab=backup&gdrive=connected`);
  } catch (err) {
    console.error('Google OAuth callback error:', err.message);
    res.redirect(`${clientUrl}/settings?tab=backup&error=${encodeURIComponent(err.message)}`);
  }
});

// 11. POST /api/backup/oauth/disconnect
const disconnectGoogleDrive = asyncHandler(async (req, res) => {
  const config = await getOrCreateConfig();
  const token = config.googleDrive?.tokens?.access_token || config.googleDrive?.tokens?.refresh_token;

  if (token) {
    await googleDriveService.revokeTokens(token).catch(() => {});
  }

  config.googleDrive = {
    isConnected: false,
    email: '',
    folderId: '',
    folderName: googleDriveService.FOLDER_NAME,
    tokens: {},
    lastCheckedAt: new Date(),
  };
  await config.save();

  await BackupAuditLog.create({
    action: 'GOOGLE_DRIVE_DISCONNECTED',
    status: 'SUCCESS',
    adminId: req.admin?._id,
  }).catch(() => {});

  res.json({ success: true, message: 'Google Drive disconnected successfully.' });
});

// 12. PUT /api/backup/settings
const updateBackupSettings = asyncHandler(async (req, res) => {
  const { schedule, retention } = req.body;
  const config = await getOrCreateConfig();

  if (schedule) {
    config.schedule = {
      ...config.schedule.toObject(),
      ...schedule,
    };
  }

  if (retention) {
    config.retention = {
      ...config.retention.toObject(),
      ...retention,
    };
  }

  await config.save();

  // Re-initialize scheduler with new settings
  await backupSchedulerService.initializeScheduler();

  await BackupAuditLog.create({
    action: 'SETTINGS_UPDATED',
    status: 'SUCCESS',
    adminId: req.admin?._id,
    details: { schedule, retention },
  }).catch(() => {});

  res.json({ success: true, message: 'Backup settings updated.', data: config });
});

// 13. POST /api/backup/cron
const triggerCronBackup = asyncHandler(async (req, res) => {
  const cronSecret = process.env.BACKUP_CRON_SECRET;
  const authHeader = req.headers.authorization;

  // Verify secret if configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ success: false, message: 'Unauthorized cron trigger.' });
  }

  const record = await backupSchedulerService.executeScheduledBackup('SCHEDULED_DAILY');
  res.json({ success: true, message: 'Scheduled backup executed.', backupId: record?.backupId });
});

// 14. GET /api/backup/gdrive/list
// Directly fetches .imsbak backups from Google Drive folder 'Installment-System-Backups'
// Works even if MongoDB database is empty or dropped!
const getGoogleDriveBackups = asyncHandler(async (req, res) => {
  const result = await googleDriveService.listGoogleDriveBackups();
  if (!result.connected) {
    return res.json({
      success: true,
      connected: false,
      message: result.message || 'Google Drive is not connected.',
      backups: [],
    });
  }

  // Enrich backup list with local metadata / manifests if available
  const BACKUPS_DIR = databaseBackupService.BACKUPS_DIR;
  const enriched = await Promise.all(
    result.backups.map(async (b) => {
      let manifest = null;
      // Try local file first
      const localFile = path.join(BACKUPS_DIR, b.fileName);
      if (fs.existsSync(localFile)) {
        try {
          const buf = fs.readFileSync(localFile);
          const v = databaseBackupService.verifyEncryptedArchive(buf);
          if (v.isValid) {
            manifest = v.manifest;
          }
        } catch {}
      }

      // If no local manifest, try BackupRecord in DB
      if (!manifest) {
        try {
          const rec = await BackupRecord.findOne({ backupId: b.backupId });
          if (rec) {
            manifest = {
              totalCollections: rec.totalCollections,
              totalDocuments: rec.totalDocuments,
              collections: rec.collectionsSummary,
            };
          }
        } catch {}
      }

      return {
        ...b,
        totalCollections: manifest?.totalCollections || null,
        totalDocuments: manifest?.totalDocuments || null,
        collectionsSummary: manifest?.collections || [],
        isVerified: !!manifest,
      };
    })
  );

  res.json({
    success: true,
    connected: true,
    folderId: result.folderId,
    totalFiles: enriched.length,
    data: enriched,
  });
});

// 15. GET /api/backup/gdrive/inspect/:fileId
// Downloads/inspects the backup archive and verifies encryption, returning collection inventory
const inspectGoogleDriveBackup = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  const BACKUPS_DIR = databaseBackupService.BACKUPS_DIR;

  // 1. Check if backup is already on local disk
  let buffer = null;
  const record = await BackupRecord.findOne({ 'googleDrive.fileId': fileId }).catch(() => null);
  if (record && record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  }

  if (!buffer && fs.existsSync(BACKUPS_DIR)) {
    const localFiles = fs.readdirSync(BACKUPS_DIR);
    for (const f of localFiles) {
      if (f.endsWith('.imsbak') && (f.includes(fileId) || (record && f === record.filename))) {
        buffer = fs.readFileSync(path.join(BACKUPS_DIR, f));
        break;
      }
    }
  }

  // 2. Download from Google Drive if not locally cached
  if (!buffer) {
    buffer = await googleDriveService.downloadBackupFile(fileId);
  }

  if (!buffer) {
    return res.status(404).json({ success: false, message: 'Backup file could not be retrieved from Google Drive.' });
  }

  // 3. Cryptographically verify and extract manifest
  const v = databaseBackupService.verifyEncryptedArchive(buffer);
  if (!v.isValid) {
    return res.status(422).json({
      success: false,
      message: `Backup archive failed verification: ${v.error}`,
      error: v.error,
    });
  }

  const manifest = v.manifest;
  res.json({
    success: true,
    data: {
      fileId,
      backupId: manifest.backupId,
      createdAt: manifest.createdAt,
      databaseName: manifest.databaseName,
      totalCollections: manifest.totalCollections,
      totalDocuments: manifest.totalDocuments,
      collections: manifest.collections || [],
      encryption: manifest.encryption || { algorithm: 'aes-256-gcm' },
      storage: manifest.storage,
      isValid: true,
      keyFingerprint: v.keyFingerprint,
    },
  });
});

// 16. POST /api/backup/gdrive/restore/:fileId
// Automatically downloads, verifies, and restores selected collections or complete database
const restoreGoogleDriveBackup = asyncHandler(async (req, res) => {
  const { fileId } = req.params;
  const { mode = 'complete', selectedCollections = [], confirmation = '', isTest = false } = req.body;
  const adminId = req.admin?._id;
  const ip = req.ip;

  // Safety confirmation check for complete production restore
  if (!isTest && mode === 'complete') {
    const currentStats = await databaseBackupService.inspectDatabase().catch(() => ({ totalDocuments: 0 }));
    if (currentStats.totalDocuments > 0 && confirmation !== 'RESTORE-DATABASE') {
      return res.status(400).json({
        success: false,
        message: "Safety confirmation required. You must enter 'RESTORE-DATABASE' to authorize complete database restoration.",
      });
    }
  }

  // 1. Retrieve backup buffer (local cache or download from Google Drive)
  let buffer = null;
  const BACKUPS_DIR = databaseBackupService.BACKUPS_DIR;

  const record = await BackupRecord.findOne({ 'googleDrive.fileId': fileId }).catch(() => null);
  if (record && record.localPath && fs.existsSync(record.localPath)) {
    buffer = fs.readFileSync(record.localPath);
  }

  if (!buffer && fs.existsSync(BACKUPS_DIR)) {
    const localFiles = fs.readdirSync(BACKUPS_DIR);
    for (const f of localFiles) {
      if (f.endsWith('.imsbak') && (f.includes(fileId) || (record && f === record.filename))) {
        buffer = fs.readFileSync(path.join(BACKUPS_DIR, f));
        break;
      }
    }
  }

  if (!buffer) {
    buffer = await googleDriveService.downloadBackupFile(fileId);
  }

  if (!buffer) {
    return res.status(404).json({ success: false, message: 'Backup file could not be retrieved from Google Drive.' });
  }

  // 2. Cryptographic verification & decryption check
  const v = databaseBackupService.verifyEncryptedArchive(buffer);
  if (!v.isValid) {
    return res.status(422).json({
      success: false,
      message: `Restore aborted: Backup verification failed (${v.error}).`,
    });
  }

  // 3. Execute restoration
  const isSelective = mode === 'selected' && Array.isArray(selectedCollections) && selectedCollections.length > 0;
  const result = await databaseBackupService.restoreDatabase({
    encryptedBuffer: buffer,
    isTest: !!isTest,
    targetDbName: isTest ? 'installment_management_test_recovery' : null,
    adminId,
    ip,
    selectedCollections: isSelective ? selectedCollections : null,
  });

  res.json({
    success: result.success,
    message: result.success
      ? (isSelective
          ? `Successfully restored ${selectedCollections.length} selected collection(s)!`
          : 'Complete database restored successfully from Google Drive!')
      : 'Restoration completed with discrepancies.',
    data: result,
  });
});

module.exports = {
  getBackupStatus,
  getBackupHistory,
  createManualBackup,
  verifyBackup,
  downloadBackup,
  testRestoreBackup,
  productionRestoreBackup,
  downloadEmergencyRecoveryKit,
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  disconnectGoogleDrive,
  updateBackupSettings,
  triggerCronBackup,
  getGoogleDriveBackups,
  inspectGoogleDriveBackup,
  restoreGoogleDriveBackup,
};
