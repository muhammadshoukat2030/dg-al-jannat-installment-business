const mongoose = require('mongoose');

const backupConfigSchema = new mongoose.Schema(
  {
    // Singleton identifier
    key: { type: String, default: 'global_backup_config', unique: true },

    // Google Drive OAuth 2.0 Credentials (stored securely)
    googleDrive: {
      isConnected: { type: Boolean, default: false },
      email: { type: String, default: '' },
      folderId: { type: String, default: '' },
      folderName: { type: String, default: 'Installment-System-Backups' },
      tokens: {
        access_token: { type: String, default: '' },
        refresh_token: { type: String, default: '' },
        expiry_date: { type: Number, default: 0 },
        token_type: { type: String, default: 'Bearer' },
        scope: { type: String, default: '' },
      },
      lastCheckedAt: { type: Date, default: null },
      storageQuota: {
        usageBytes: { type: Number, default: 0 },
        limitBytes: { type: Number, default: 0 },
      },
    },

    // Scheduling Settings (Preferred: Asia/Karachi)
    schedule: {
      isEnabled: { type: Boolean, default: false },
      timezone: { type: String, default: 'Asia/Karachi' },
      daily: {
        enabled: { type: Boolean, default: true },
        time: { type: String, default: '02:00' }, // 2:00 AM PKT
      },
      weekly: {
        enabled: { type: Boolean, default: true },
        dayOfWeek: { type: Number, default: 0 }, // 0 = Sunday
        time: { type: String, default: '02:00' },
      },
      monthly: {
        enabled: { type: Boolean, default: true },
        dayOfMonth: { type: Number, default: 1 }, // 1st of month
        time: { type: String, default: '02:00' },
      },
      lastRunAt: { type: Date, default: null },
      lastRunStatus: { type: String, enum: ['SUCCESS', 'FAILED', 'PENDING', 'IDLE'], default: 'IDLE' },
      lastRunError: { type: String, default: '' },
      nextRunAt: { type: Date, default: null },
    },

    // Retention Policies
    retention: {
      dailyDays: { type: Number, default: 30, min: 1 },
      weeklyWeeks: { type: Number, default: 12, min: 1 },
      monthlyMonths: { type: Number, default: 12, min: 1 },
    },

    // Security & Emergency Recovery Key Metadata (Hint only, never the key itself)
    security: {
      keyFingerprint: { type: String, default: '' },
      keyConfigured: { type: Boolean, default: false },
      lastVerifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BackupConfig', backupConfigSchema);
