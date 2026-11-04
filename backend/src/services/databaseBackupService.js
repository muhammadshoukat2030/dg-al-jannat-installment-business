/**
 * Database Backup and Disaster Recovery Service for Installment Management System 6
 *
 * Utilizes official MongoDB Database Tools (mongodump/mongorestore),
 * comprehensive metadata manifests, AES-256-GCM authenticated encryption,
 * SHA-256 integrity verification, and isolated disaster recovery testing.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

const cryptoService = require('./cryptoService');
const BackupRecord = require('../models/BackupRecord');
const BackupAuditLog = require('../models/BackupAuditLog');
const BackupConfig = require('../models/BackupConfig');

const BACKUPS_DIR = path.resolve(__dirname, '../../backups');
if (!fs.existsSync(BACKUPS_DIR)) {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
}

// Resolve mongodump and mongorestore executable paths
function getToolPath(toolName) {
  const isWindows = process.platform === 'win32';
  const binaryName = isWindows ? `${toolName}.exe` : toolName;

  // 1. Check local backend/bin directory
  const localBin = path.resolve(__dirname, '../../bin', binaryName);
  if (fs.existsSync(localBin)) return localBin;

  // 2. Check system PATH
  return binaryName;
}

/**
 * Discovers all collections, document counts, and indexes in the current database.
 */
async function inspectDatabase(dbInstance = null) {
  const db = dbInstance || mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');

  const rawCollections = await db.listCollections().toArray();
  const collections = rawCollections.filter((c) => !c.name.startsWith('system.'));

  let totalDocuments = 0;
  const summary = [];

  for (const col of collections) {
    const collObj = db.collection(col.name);
    const count = await collObj.countDocuments().catch(() => 0);
    const indexes = await collObj.indexes().catch(() => []);
    totalDocuments += count;
    summary.push({
      name: col.name,
      documentCount: count,
      indexCount: indexes.length,
      indexes: indexes.map((idx) => ({ name: idx.name, key: idx.key, unique: !!idx.unique })),
    });
  }

  summary.sort((a, b) => a.name.localeCompare(b.name));

  return {
    databaseName: db.databaseName,
    totalCollections: summary.length,
    totalDocuments,
    collections: summary,
  };
}

/**
 * Executes a child process tool with timeout and output capture.
 */
function runTool(toolPath, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(toolPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      ...options,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d));
    proc.stderr.on('data', (d) => (stderr += d));

    proc.on('error', (err) => reject(new Error(`Failed to execute ${path.basename(toolPath)}: ${err.message}`)));

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${path.basename(toolPath)} failed (exit code ${code}): ${stderr || stdout}`));
      }
    });
  });
}

/**
 * Creates a complete database backup, manifest, and encrypted archive.
 */
async function createDatabaseBackup({
  type = 'MANUAL',
  createdBy = null,
  keepLocal = true,
  customDbUri = null,
} = {}) {
  const startTime = Date.now();
  const backupId = `ims_bak_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${Math.random().toString(36).substring(2, 7)}`;
  const dumpTool = getToolPath('mongodump');
  const tempArchiveFile = path.join(os.tmpdir(), `${backupId}_raw.archive`);
  const finalEncryptedFile = path.join(BACKUPS_DIR, `${backupId}.imsbak`);

  // Log start
  await BackupAuditLog.create({
    action: 'BACKUP_STARTED',
    status: 'INFO',
    backupId,
    adminId: createdBy,
    details: { type },
  }).catch(() => {});

  try {
    const dbUri = customDbUri || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_management3';

    // 1. Gather comprehensive database manifest before dump
    const dbStats = await inspectDatabase();

    // 2. Run official mongodump with gzip compression and single-file archive
    await runTool(dumpTool, [
      `--uri=${dbUri}`,
      `--archive=${tempArchiveFile}`,
      '--gzip',
    ]);

    const plainArchiveBuffer = fs.readFileSync(tempArchiveFile);
    const plainSizeBytes = plainArchiveBuffer.length;

    // 3. Construct Complete Database Manifest
    const manifest = {
      backupId,
      version: '2.0-secure-gcm',
      createdAt: new Date().toISOString(),
      databaseName: dbStats.databaseName,
      toolsVersion: '100.10.0',
      totalCollections: dbStats.totalCollections,
      totalDocuments: dbStats.totalDocuments,
      collections: dbStats.collections,
      storage: {
        plainSizeBytes,
        plainSha256: cryptoService.calculateSha256(plainArchiveBuffer),
      },
      encryption: {
        algorithm: 'aes-256-gcm',
        keyFingerprint: cryptoService.getKeyFingerprint(),
      },
      files: {
        included: 0,
        note: 'All transaction records, plans, receipts, and customers are stored natively in MongoDB. Receipts and statements are rendered on-demand deterministically.',
      },
      status: 'VERIFIED',
    };

    // 4. Combine Manifest + Archive into a structured binary package
    // Format: [4 bytes manifest length] + [manifest JSON UTF-8] + [raw archive payload]
    const manifestJsonBuffer = Buffer.from(JSON.stringify(manifest), 'utf-8');
    const manifestLenHeader = Buffer.alloc(4);
    manifestLenHeader.writeUInt32BE(manifestJsonBuffer.length, 0);

    const fullPackage = Buffer.concat([manifestLenHeader, manifestJsonBuffer, plainArchiveBuffer]);

    // 5. Encrypt with AES-256-GCM using unique per-archive cryptographic salt
    const encryptionResult = cryptoService.encryptArchiveBuffer(fullPackage);
    const encryptedBuffer = encryptionResult.encryptedBuffer;
    const encryptedSizeBytes = encryptedBuffer.length;

    // 6. Write final encrypted file
    fs.writeFileSync(finalEncryptedFile, encryptedBuffer);

    // Remove temporary unencrypted file immediately
    try {
      fs.unlinkSync(tempArchiveFile);
    } catch {}

    // 7. Verify the written archive
    const verified = verifyEncryptedArchive(encryptedBuffer);
    if (!verified.isValid) {
      throw new Error(`Self-verification of newly generated backup failed: ${verified.error}`);
    }

    // 8. Record in BackupRecord
    const record = await BackupRecord.create({
      backupId,
      type,
      status: 'SUCCESS',
      filename: `${backupId}.imsbak`,
      plainSizeBytes,
      encryptedSizeBytes,
      checksumSha256: encryptionResult.sha256,
      databaseName: dbStats.databaseName,
      totalCollections: dbStats.totalCollections,
      totalDocuments: dbStats.totalDocuments,
      collectionsSummary: dbStats.collections.map((c) => ({
        name: c.name,
        documentCount: c.documentCount,
        indexCount: c.indexCount,
      })),
      localPath: keepLocal ? finalEncryptedFile : '',
      isLocalKept: keepLocal,
      encryption: {
        algorithm: 'aes-256-gcm',
        version: encryptionResult.version || '2.0-salt',
        saltHex: encryptionResult.saltHex || '',
        ivHex: encryptionResult.ivHex,
        authTagHex: encryptionResult.authTagHex,
        keyFingerprint: encryptionResult.keyFingerprint,
      },
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      verificationDetails: 'Cryptographic auth tag and SHA-256 checksum verified immediately after packaging.',
      createdBy,
    });

    // 9. Update config stats
    await BackupConfig.findOneAndUpdate(
      { key: 'global_backup_config' },
      {
        $set: {
          'schedule.lastRunAt': new Date(),
          'schedule.lastRunStatus': 'SUCCESS',
          'schedule.lastRunError': '',
        },
      },
      { upsert: true }
    );

    // 10. Audit log completion
    await BackupAuditLog.create({
      action: 'BACKUP_COMPLETED',
      status: 'SUCCESS',
      backupId,
      adminId: createdBy,
      details: {
        durationMs: Date.now() - startTime,
        plainSizeBytes,
        encryptedSizeBytes,
        totalCollections: dbStats.totalCollections,
        totalDocuments: dbStats.totalDocuments,
      },
    }).catch(() => {});

    return {
      success: true,
      backupId,
      record,
      manifest,
      filePath: finalEncryptedFile,
      encryptedBuffer,
      checksumSha256: encryptionResult.sha256,
    };
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (fs.existsSync(tempArchiveFile)) fs.unlinkSync(tempArchiveFile);
    } catch {}

    await BackupRecord.create({
      backupId,
      type,
      status: 'FAILED',
      filename: `${backupId}.imsbak`,
      errorMessage: err.message,
      createdBy,
    }).catch(() => {});

    await BackupAuditLog.create({
      action: 'BACKUP_FAILED',
      status: 'FAILURE',
      backupId,
      adminId: createdBy,
      details: { error: err.message },
    }).catch(() => {});

    throw err;
  }
}

/**
 * Validates, decrypts, and extracts manifest from an encrypted backup archive buffer.
 */
function verifyEncryptedArchive(encryptedBuffer, customKey = null) {
  try {
    const decryptedPackage = cryptoService.decryptBuffer(encryptedBuffer, customKey);

    if (decryptedPackage.length < 4) {
      return { isValid: false, error: 'Decrypted archive is empty or invalid header.' };
    }

    const manifestLen = decryptedPackage.readUInt32BE(0);
    if (decryptedPackage.length < 4 + manifestLen) {
      return { isValid: false, error: 'Manifest header length exceeds archive payload.' };
    }

    const manifestJson = decryptedPackage.subarray(4, 4 + manifestLen).toString('utf-8');
    const manifest = JSON.parse(manifestJson);
    const rawArchive = decryptedPackage.subarray(4 + manifestLen);

    // Verify raw archive checksum matches manifest
    const calculatedPlainSha256 = cryptoService.calculateSha256(rawArchive);
    if (manifest.storage?.plainSha256 && manifest.storage.plainSha256 !== calculatedPlainSha256) {
      return { isValid: false, error: 'Raw archive checksum mismatch with manifest.' };
    }

    return {
      isValid: true,
      manifest,
      rawArchive,
      keyFingerprint: cryptoService.getKeyFingerprint(customKey),
    };
  } catch (err) {
    return { isValid: false, error: err.message };
  }
}

/**
 * Restores a database backup archive into a target MongoDB database.
 * Supports:
 * 1. Isolated test restoration (into e.g. installment_management_test_recovery)
 * 2. Production disaster recovery restoration (with pre-restore safety snapshot)
 */
async function restoreDatabase({
  backupRecordId = null,
  encryptedBuffer = null,
  filePath = null,
  isTest = true,
  targetDbName = null,
  customTargetUri = null,
  adminId = null,
  ip = '',
  selectedCollections = null,
  forceSafetySnapshot = false,
} = {}) {
  const startTime = Date.now();
  const restoreTool = getToolPath('mongorestore');

  // 1. Resolve encrypted buffer
  let archiveBuffer = encryptedBuffer;
  let record = null;

  if (!archiveBuffer && backupRecordId) {
    record = await BackupRecord.findOne({ backupId: backupRecordId }).catch(() => null);
    if (record && record.localPath && fs.existsSync(record.localPath)) {
      archiveBuffer = fs.readFileSync(record.localPath);
    }
  }

  if (!archiveBuffer && filePath && fs.existsSync(filePath)) {
    archiveBuffer = fs.readFileSync(filePath);
  }

  if (!archiveBuffer) {
    throw new Error('Encrypted backup data was not provided and could not be loaded locally.');
  }

  // 2. Cryptographic Verification & Decryption
  const verification = verifyEncryptedArchive(archiveBuffer);
  if (!verification.isValid) {
    await BackupAuditLog.create({
      action: 'RESTORE_FAILED',
      status: 'FAILURE',
      backupId: record?.backupId || 'unknown',
      adminId,
      ip,
      details: { error: verification.error },
    }).catch(() => {});
    throw new Error(`Restore rejected: Backup verification failed: ${verification.error}`);
  }

  const { manifest, rawArchive } = verification;
  const sourceDbName = manifest.databaseName || 'installment_management3';
  const destinationDbName = isTest
    ? targetDbName || 'installment_management_test_recovery'
    : targetDbName || sourceDbName;

  // 3. Log restore start
  await BackupAuditLog.create({
    action: 'RESTORE_STARTED',
    status: 'INFO',
    backupId: manifest.backupId,
    adminId,
    ip,
    details: { isTest, targetDbName: destinationDbName, selectedCollections },
  }).catch(() => {});

  // 4. If this is a production restore (or forced safety snapshot) and database contains recoverable records, create an automatic safety backup first!
  let safetyBackupId = null;
  if (!isTest || forceSafetySnapshot) {
    try {
      const currentStats = await inspectDatabase().catch(() => null);
      if (currentStats && currentStats.totalDocuments > 0) {
        console.log('Taking automatic safety backup before production restoration...');
        const safetyBackup = await createDatabaseBackup({
          type: 'SAFETY_PRE_RESTORE',
          createdBy: adminId,
          keepLocal: true,
        });
        safetyBackupId = safetyBackup.backupId;
      } else {
        console.log('Notice: Production database is currently empty — skipping safety snapshot.');
      }
    } catch (safetyErr) {
      console.warn('Notice: Could not take safety backup (database may be completely empty/deleted):', safetyErr.message);
    }
  }

  // 5. Write raw uncompressed BSON archive to a secure temporary file for mongorestore
  const tempRestoreFile = path.join(os.tmpdir(), `restore_${manifest.backupId}_${Date.now()}.archive`);
  fs.writeFileSync(tempRestoreFile, rawArchive);

  try {
    const baseUri = customTargetUri || process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';

    // mongorestore arguments:
    // If selectedCollections is provided, only include those collections!
    // With --drop, only the included collections are dropped and replaced.
    const restoreArgs = [
      `--uri=${baseUri}`,
      `--archive=${tempRestoreFile}`,
      '--gzip',
      '--drop',
    ];

    const hasSelective = Array.isArray(selectedCollections) && selectedCollections.length > 0;

    if (destinationDbName !== sourceDbName) {
      restoreArgs.push(`--nsFrom=${sourceDbName}.*`);
      restoreArgs.push(`--nsTo=${destinationDbName}.*`);
      if (hasSelective) {
        for (const col of selectedCollections) {
          restoreArgs.push(`--nsInclude=${destinationDbName}.${col}`);
        }
      } else {
        restoreArgs.push(`--nsInclude=${destinationDbName}.*`);
      }
    } else {
      if (hasSelective) {
        for (const col of selectedCollections) {
          restoreArgs.push(`--nsInclude=${sourceDbName}.${col}`);
        }
      }
    }

    // 6. Execute mongorestore
    const restoreResult = await runTool(restoreTool, restoreArgs);

    // 7. Connect to the restored database to audit and verify restoration
    const connStr = baseUri.includes('?')
      ? baseUri.replace(/\/([^/?]+)(\?.*)?$/, `/${destinationDbName}$2`)
      : baseUri.replace(/\/([^/?]+)$/, `/${destinationDbName}`);

    const verifyConn = await mongoose.createConnection(connStr).asPromise();
    const restoredStats = await inspectDatabase(verifyConn.db);

    // 8. Validate restored collections & counts against manifest
    const discrepancies = [];
    const expectedCollections = hasSelective
      ? manifest.collections.filter((c) => selectedCollections.includes(c.name))
      : manifest.collections;

    for (const expectedCol of expectedCollections) {
      const restoredCol = restoredStats.collections.find((c) => c.name === expectedCol.name);
      if (!restoredCol) {
        discrepancies.push(`Missing collection: ${expectedCol.name}`);
      } else if (restoredCol.documentCount !== expectedCol.documentCount) {
        discrepancies.push(
          `Document count mismatch in '${expectedCol.name}': expected ${expectedCol.documentCount}, restored ${restoredCol.documentCount}`
        );
      }
    }

    await verifyConn.close();

    const isFullyVerified = discrepancies.length === 0;

    // 9. Audit log completion
    await BackupAuditLog.create({
      action: isTest ? 'RESTORE_TEST_COMPLETED' : 'RESTORE_PRODUCTION_COMPLETED',
      status: isFullyVerified ? 'SUCCESS' : 'FAILURE',
      backupId: manifest.backupId,
      adminId,
      ip,
      details: {
        isTest,
        targetDbName: destinationDbName,
        restoredCollections: expectedCollections.length,
        durationMs: Date.now() - startTime,
        isFullyVerified,
        discrepancies,
        safetyBackupId,
        selectedCollections: hasSelective ? selectedCollections : 'ALL',
      },
    }).catch(() => {});

    // Calculate total documents for restored collections
    const totalRestoredDocs = expectedCollections.reduce((sum, c) => sum + (c.documentCount || 0), 0);

    return {
      success: isFullyVerified,
      backupId: manifest.backupId,
      isTest,
      mode: hasSelective ? 'selected' : 'complete',
      targetDbName: destinationDbName,
      restoredCollections: expectedCollections.map((c) => ({
        name: c.name,
        documentCount: c.documentCount,
      })),
      totalRestoredCollections: expectedCollections.length,
      restoredDocuments: totalRestoredDocs,
      discrepancies,
      safetyBackupId,
      details: restoreResult.stderr || restoreResult.stdout,
    };
  } finally {
    // Always clean up raw unencrypted archive from temp disk
    try {
      if (fs.existsSync(tempRestoreFile)) fs.unlinkSync(tempRestoreFile);
    } catch {}
  }
}

module.exports = {
  BACKUPS_DIR,
  inspectDatabase,
  createDatabaseBackup,
  verifyEncryptedArchive,
  restoreDatabase,
};
