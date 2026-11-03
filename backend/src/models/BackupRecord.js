const mongoose = require('mongoose');

const backupRecordSchema = new mongoose.Schema(
  {
    backupId: { type: String, required: true, unique: true, index: true },
    type: { type: String, enum: ['MANUAL', 'SCHEDULED_DAILY', 'SCHEDULED_WEEKLY', 'SCHEDULED_MONTHLY', 'SAFETY_PRE_RESTORE'], default: 'MANUAL' },
    status: { type: String, enum: ['IN_PROGRESS', 'SUCCESS', 'FAILED'], default: 'IN_PROGRESS', index: true },
    filename: { type: String, required: true },
    plainSizeBytes: { type: Number, default: 0 },
    encryptedSizeBytes: { type: Number, default: 0 },
    checksumSha256: { type: String, default: '' },
    databaseName: { type: String, default: '' },
    totalCollections: { type: Number, default: 0 },
    totalDocuments: { type: Number, default: 0 },
    collectionsSummary: [
      {
        name: { type: String },
        documentCount: { type: Number },
        indexCount: { type: Number },
      },
    ],
    // Google Drive Storage Info
    googleDrive: {
      fileId: { type: String, default: '' },
      folderId: { type: String, default: '' },
      uploadedAt: { type: Date, default: null },
      webContentLink: { type: String, default: '' },
    },
    // Local path if retained temporarily or in local storage
    localPath: { type: String, default: '' },
    isLocalKept: { type: Boolean, default: false },

    // Encryption & Integrity Info
    encryption: {
      algorithm: { type: String, default: 'aes-256-gcm' },
      ivHex: { type: String, default: '' },
      authTagHex: { type: String, default: '' },
      keyFingerprint: { type: String, default: '' },
    },
    verificationStatus: { type: String, enum: ['UNVERIFIED', 'VERIFIED', 'FAILED'], default: 'UNVERIFIED' },
    verifiedAt: { type: Date, default: null },
    verificationDetails: { type: String, default: '' },

    errorMessage: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

backupRecordSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BackupRecord', backupRecordSchema);
