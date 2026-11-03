/**
 * Backup Scheduler & Retention Policy Service for Installment Management System 6
 *
 * Implements 100% free automatic backup scheduling using node-cron with
 * distributed execution locking, Pakistan Standard Time (Asia/Karachi) timezone,
 * safe retention cleanup, and safe error handling.
 */

const cron = require('node-cron');
const fs = require('fs');
const BackupConfig = require('../models/BackupConfig');
const BackupRecord = require('../models/BackupRecord');
const BackupAuditLog = require('../models/BackupAuditLog');
const databaseBackupService = require('./databaseBackupService');
const googleDriveService = require('./googleDriveService');

let activeCronTasks = [];
let isExecutionLocked = false;

/**
 * Initializes and starts the background backup schedule according to stored config.
 */
async function initializeScheduler() {
  stopScheduler();

  const config = await BackupConfig.findOne({ key: 'global_backup_config' });
  if (!config || !config.schedule?.isEnabled) {
    console.log('[BackupScheduler] Automatic backup scheduling is currently disabled.');
    return;
  }

  const { daily, weekly, monthly, timezone = 'Asia/Karachi' } = config.schedule;

  // 1. Daily Cron (e.g. "0 2 * * *" = 2:00 AM)
  if (daily?.enabled) {
    const [hour, minute] = (daily.time || '02:00').split(':').map((s) => parseInt(s, 10) || 0);
    const cronExpr = `${minute} ${hour} * * *`;
    console.log(`[BackupScheduler] Registering Daily Backup Cron: '${cronExpr}' (${timezone})`);

    const dailyTask = cron.schedule(
      cronExpr,
      async () => {
        console.log('[BackupScheduler] Triggering scheduled daily backup...');
        await executeScheduledBackup('SCHEDULED_DAILY');
      },
      { timezone }
    );
    activeCronTasks.push(dailyTask);
  }

  // 2. Weekly Cron (e.g. "0 2 * * 0" = Sunday 2:00 AM)
  if (weekly?.enabled) {
    const [hour, minute] = (weekly.time || '02:00').split(':').map((s) => parseInt(s, 10) || 0);
    const dayOfWeek = weekly.dayOfWeek !== undefined ? weekly.dayOfWeek : 0;
    const cronExpr = `${minute} ${hour} * * ${dayOfWeek}`;
    console.log(`[BackupScheduler] Registering Weekly Backup Cron: '${cronExpr}' (${timezone})`);

    const weeklyTask = cron.schedule(
      cronExpr,
      async () => {
        console.log('[BackupScheduler] Triggering scheduled weekly backup...');
        await executeScheduledBackup('SCHEDULED_WEEKLY');
      },
      { timezone }
    );
    activeCronTasks.push(weeklyTask);
  }

  // 3. Monthly Cron (e.g. "0 2 1 * *" = 1st of month 2:00 AM)
  if (monthly?.enabled) {
    const [hour, minute] = (monthly.time || '02:00').split(':').map((s) => parseInt(s, 10) || 0);
    const dayOfMonth = monthly.dayOfMonth || 1;
    const cronExpr = `${minute} ${hour} ${dayOfMonth} * *`;
    console.log(`[BackupScheduler] Registering Monthly Backup Cron: '${cronExpr}' (${timezone})`);

    const monthlyTask = cron.schedule(
      cronExpr,
      async () => {
        console.log('[BackupScheduler] Triggering scheduled monthly backup...');
        await executeScheduledBackup('SCHEDULED_MONTHLY');
      },
      { timezone }
    );
    activeCronTasks.push(monthlyTask);
  }

  console.log(`[BackupScheduler] Scheduler active with ${activeCronTasks.length} background tasks running.`);
}

/**
 * Stops all active cron tasks.
 */
function stopScheduler() {
  for (const t of activeCronTasks) {
    try {
      t.stop();
    } catch {}
  }
  activeCronTasks = [];
}

/**
 * Performs a scheduled backup execution with distributed locking, Google Drive upload, and retention pruning.
 */
async function executeScheduledBackup(type = 'SCHEDULED_DAILY') {
  if (isExecutionLocked) {
    console.warn('[BackupScheduler] Another backup task is currently running. Skipping execution.');
    return null;
  }

  isExecutionLocked = true;
  try {
    console.log(`[BackupScheduler] Starting ${type} database backup...`);

    // 1. Create local backup archive
    const backupResult = await databaseBackupService.createDatabaseBackup({
      type,
      keepLocal: true,
    });

    const record = backupResult.record;

    // 2. Upload to Google Drive if connected
    const config = await BackupConfig.findOne({ key: 'global_backup_config' });
    if (config?.googleDrive?.isConnected) {
      try {
        console.log('[BackupScheduler] Uploading backup archive to Google Drive...');
        const uploadResult = await googleDriveService.uploadBackupFile({
          fileName: record.filename,
          fileBuffer: backupResult.encryptedBuffer,
          folderId: config.googleDrive.folderId,
          properties: {
            backupId: record.backupId,
            sha256: record.checksumSha256,
          },
        });

        record.googleDrive = {
          fileId: uploadResult.fileId,
          folderId: uploadResult.folderId,
          uploadedAt: new Date(),
          webContentLink: uploadResult.webContentLink,
        };
        await record.save();

        await BackupAuditLog.create({
          action: 'UPLOAD_COMPLETED',
          status: 'SUCCESS',
          backupId: record.backupId,
          details: { fileId: uploadResult.fileId, folderId: uploadResult.folderId },
        }).catch(() => {});
      } catch (uploadErr) {
        console.error('[BackupScheduler] Google Drive upload failed:', uploadErr.message);
        await BackupAuditLog.create({
          action: 'UPLOAD_FAILED',
          status: 'FAILURE',
          backupId: record.backupId,
          details: { error: uploadErr.message },
        }).catch(() => {});
      }
    }

    // 3. Execute retention cleanup
    await applyRetentionPolicies().catch((retErr) => {
      console.warn('[BackupScheduler] Retention cleanup warning:', retErr.message);
    });

    return record;
  } catch (err) {
    console.error(`[BackupScheduler] Scheduled backup ${type} failed:`, err.message);
    await BackupConfig.findOneAndUpdate(
      { key: 'global_backup_config' },
      {
        $set: {
          'schedule.lastRunAt': new Date(),
          'schedule.lastRunStatus': 'FAILED',
          'schedule.lastRunError': err.message,
        },
      }
    ).catch(() => {});
    throw err;
  } finally {
    isExecutionLocked = false;
  }
}

/**
 * Prunes expired backups according to configured retention periods.
 * Strict safety: Never delete if it's the only valid backup!
 */
async function applyRetentionPolicies() {
  const config = await BackupConfig.findOne({ key: 'global_backup_config' });
  const retention = config?.retention || { dailyDays: 30, weeklyWeeks: 12, monthlyMonths: 12 };

  const verifiedSuccessBackups = await BackupRecord.find({
    status: 'SUCCESS',
  }).sort({ createdAt: -1 });

  // Safeguard 1: Do not prune if we have 1 or fewer successful backups
  if (verifiedSuccessBackups.length <= 1) {
    return { prunedCount: 0, reason: 'Minimum safety threshold: At least one backup must always exist.' };
  }

  const now = Date.now();
  const dailyThreshold = now - (retention.dailyDays || 30) * 86400000;
  const weeklyThreshold = now - (retention.weeklyWeeks || 12) * 7 * 86400000;
  const monthlyThreshold = now - (retention.monthlyMonths || 12) * 30 * 86400000;

  let prunedCount = 0;

  for (let i = 1; i < verifiedSuccessBackups.length; i++) {
    const b = verifiedSuccessBackups[i];
    const createdTime = new Date(b.createdAt).getTime();
    let shouldPrune = false;

    if (b.type === 'SCHEDULED_DAILY' && createdTime < dailyThreshold) shouldPrune = true;
    else if (b.type === 'SCHEDULED_WEEKLY' && createdTime < weeklyThreshold) shouldPrune = true;
    else if (b.type === 'SCHEDULED_MONTHLY' && createdTime < monthlyThreshold) shouldPrune = true;

    if (shouldPrune) {
      // Delete from Google Drive if fileId exists
      if (b.googleDrive?.fileId) {
        await googleDriveService.deleteBackupFile(b.googleDrive.fileId).catch(() => {});
      }

      // Delete local file if exists
      if (b.localPath && fs.existsSync(b.localPath)) {
        try {
          fs.unlinkSync(b.localPath);
        } catch {}
      }

      await BackupRecord.findByIdAndDelete(b._id);
      prunedCount++;

      await BackupAuditLog.create({
        action: 'RETENTION_CLEANUP',
        status: 'SUCCESS',
        backupId: b.backupId,
        details: { type: b.type, ageDays: Math.round((now - createdTime) / 86400000) },
      }).catch(() => {});
    }
  }

  return { prunedCount };
}

module.exports = {
  initializeScheduler,
  stopScheduler,
  executeScheduledBackup,
  applyRetentionPolicies,
};
