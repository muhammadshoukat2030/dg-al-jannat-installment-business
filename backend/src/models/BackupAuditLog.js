const mongoose = require('mongoose');

const backupAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      required: true,
      enum: [
        'BACKUP_STARTED',
        'BACKUP_COMPLETED',
        'BACKUP_FAILED',
        'BACKUP_VERIFIED',
        'BACKUP_VERIFICATION_FAILED',
        'UPLOAD_COMPLETED',
        'UPLOAD_FAILED',
        'RESTORE_STARTED',
        'RESTORE_TEST_COMPLETED',
        'RESTORE_PRODUCTION_COMPLETED',
        'RESTORE_FAILED',
        'GOOGLE_DRIVE_CONNECTED',
        'GOOGLE_DRIVE_DISCONNECTED',
        'SETTINGS_UPDATED',
        'RETENTION_CLEANUP',
        'EMERGENCY_KIT_DOWNLOADED',
      ],
      index: true,
    },
    status: { type: String, enum: ['SUCCESS', 'FAILURE', 'INFO'], default: 'INFO' },
    details: { type: Object, default: {} },
    backupId: { type: String, default: null },
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true }
);

backupAuditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackupAuditLog', backupAuditLogSchema);
