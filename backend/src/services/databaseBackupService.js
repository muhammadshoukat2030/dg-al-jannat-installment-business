/**
 * Database Backup and Disaster Recovery Service for Installment Management System 6
 *
 * Utilizes pure Node.js in-memory Extended JSON (EJSON) serialization,
 * GZIP stream compression, comprehensive metadata manifests, AES-256-GCM authenticated
 * encryption, SHA-256 integrity verification, and direct-to-memory disaster recovery.
 *
 * 100% In-Memory Architecture: Zero local files or directories created on disk.
 * Fully compatible with Vercel serverless read-only environments.
 */

const path = require('path');
const zlib = require('zlib');
const mongoose = require('mongoose');

const cryptoService = require('./cryptoService');
const BackupRecord = require('../models/BackupRecord');
const BackupAuditLog = require('../models/BackupAuditLog');
const BackupConfig = require('../models/BackupConfig');

// Constant path exported for backward compatibility with external references
const BACKUPS_DIR = path.resolve(__dirname, '../../backups');

/**
 * Parses legacy MongoDB mongodump binary archives 100% in-memory without external tools.
 */
function parseMongodumpArchiveInMemory(decomp) {
  const BSON = mongoose.mongo.BSON;
  let offset = 4; // Skip magic 6de29981
  const headerSize = decomp.readInt32LE(offset);
  offset += headerSize;

  const collectionsMeta = new Map();
  while (offset < decomp.length) {
    const size = decomp.readInt32LE(offset);
    if (size === -1) {
      offset += 4;
      break;
    }
    const doc = BSON.deserialize(decomp.subarray(offset, offset + size));
    offset += size;
    if (doc.type === 'collection') {
      const parsedMeta = doc.metadata ? JSON.parse(doc.metadata) : {};
      collectionsMeta.set(doc.collection, {
        indexes: parsedMeta.indexes || [],
      });
    }
  }

  const collectionsData = new Map();
  for (const [colName, meta] of collectionsMeta.entries()) {
    collectionsData.set(colName, {
      name: colName,
      indexes: meta.indexes
        .filter((idx) => idx.name !== '_id_')
        .map((idx) => {
          const cleanKey = {};
          for (const [k, v] of Object.entries(idx.key || {})) {
            cleanKey[k] = typeof v === 'object' && v && v['$numberInt'] ? parseInt(v['$numberInt'], 10) : v;
          }
          return {
            name: idx.name,
            key: cleanKey,
            unique: !!idx.unique,
            sparse: !!idx.sparse,
            weights: idx.weights || null,
            default_language: idx.default_language || null,
          };
        }),
      documents: [],
      isRawDocs: true,
    });
  }

  let currentCollection = null;
  while (offset < decomp.length) {
    if (offset + 4 > decomp.length) break;
    const size = decomp.readInt32LE(offset);
    if (size === -1) {
      offset += 4;
      continue;
    }
    if (size <= 0 || offset + size > decomp.length) break;

    const doc = BSON.deserialize(decomp.subarray(offset, offset + size));
    offset += size;

    if (doc.EOF !== undefined) {
      currentCollection = doc.EOF ? null : doc.collection;
    } else if (currentCollection) {
      const col = collectionsData.get(currentCollection);
      if (col) {
        col.documents.push(doc);
      }
    }
  }

  return Array.from(collectionsData.values());
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
 * Extracts all collections, documents, and indexes in memory using BSON Extended JSON.
 * Preserves exact BSON data types (ObjectId, Date, Decimal128, Binary, Int32, Long).
 */
async function extractDatabaseInMemory(dbInstance = null) {
  const db = dbInstance || mongoose.connection.db;
  if (!db) throw new Error('Database is not connected');

  const rawCollections = await db.listCollections().toArray();
  const collections = rawCollections.filter((c) => !c.name.startsWith('system.'));

  let totalDocuments = 0;
  const extracted = [];

  for (const col of collections) {
    const collObj = db.collection(col.name);
    const docs = await collObj.find({}).toArray();
    const indexes = await collObj.indexes().catch(() => []);
    totalDocuments += docs.length;

    // Strict EJSON serialization preserves exact BSON types
    const serializedDocs = docs.map((d) => mongoose.mongo.BSON.EJSON.serialize(d, { relaxed: false }));

    extracted.push({
      name: col.name,
      documentCount: docs.length,
      indexes: indexes
        .filter((idx) => idx.name !== '_id_')
        .map((idx) => ({
          name: idx.name,
          key: idx.key,
          unique: !!idx.unique,
          sparse: !!idx.sparse,
          weights: idx.weights || null,
          default_language: idx.default_language || null,
        })),
      documents: serializedDocs,
    });
  }

  extracted.sort((a, b) => a.name.localeCompare(b.name));

  return {
    databaseName: db.databaseName,
    totalCollections: extracted.length,
    totalDocuments,
    collections: extracted,
  };
}

/**
 * Creates a complete database backup, manifest, and encrypted archive entirely in memory.
 * Zero files or directories are written to disk.
 */
async function createDatabaseBackup({
  type = 'MANUAL',
  createdBy = null,
  customDbUri = null,
} = {}) {
  const startTime = Date.now();
  const backupId = `ims_bak_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}_${Math.random().toString(36).substring(2, 7)}`;

  // Log start
  await BackupAuditLog.create({
    action: 'BACKUP_STARTED',
    status: 'INFO',
    backupId,
    adminId: createdBy,
    details: { type, inMemory: true },
  }).catch(() => {});

  try {
    // 1. Gather comprehensive database data directly in memory
    let dbInstance = null;
    let externalConn = null;

    if (customDbUri) {
      externalConn = await mongoose.createConnection(customDbUri).asPromise();
      dbInstance = externalConn.db;
    } else {
      dbInstance = mongoose.connection.db;
    }

    const extraction = await extractDatabaseInMemory(dbInstance);
    if (externalConn) await externalConn.close();

    // 2. Build structured in-memory archive payload and compress via GZIP
    const backupPayload = {
      version: '2.0-secure-gcm',
      format: 'bson-ejson',
      databaseName: extraction.databaseName,
      createdAt: new Date().toISOString(),
      collections: extraction.collections,
    };

    const payloadJsonBuffer = Buffer.from(JSON.stringify(backupPayload), 'utf-8');
    const compressedArchiveBuffer = zlib.gzipSync(payloadJsonBuffer, { level: 9 });
    const plainSizeBytes = compressedArchiveBuffer.length;

    // 3. Construct Complete Database Manifest
    const manifest = {
      backupId,
      version: '2.0-secure-gcm',
      createdAt: new Date().toISOString(),
      databaseName: extraction.databaseName,
      toolsVersion: 'node-bson-ejson-v2',
      totalCollections: extraction.totalCollections,
      totalDocuments: extraction.totalDocuments,
      collections: extraction.collections.map((c) => ({
        name: c.name,
        documentCount: c.documentCount,
        indexCount: c.indexes.length,
        indexes: c.indexes,
      })),
      storage: {
        plainSizeBytes,
        plainSha256: cryptoService.calculateSha256(compressedArchiveBuffer),
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

    // 4. Combine Manifest + Archive into a structured binary package in memory
    // Format: [4 bytes manifest length big-endian] + [manifest JSON UTF-8] + [compressed archive payload]
    const manifestJsonBuffer = Buffer.from(JSON.stringify(manifest), 'utf-8');
    const manifestLenHeader = Buffer.alloc(4);
    manifestLenHeader.writeUInt32BE(manifestJsonBuffer.length, 0);

    const fullPackage = Buffer.concat([manifestLenHeader, manifestJsonBuffer, compressedArchiveBuffer]);

    // 5. Encrypt with AES-256-GCM using unique per-archive cryptographic salt
    const encryptionResult = cryptoService.encryptArchiveBuffer(fullPackage);
    const encryptedBuffer = encryptionResult.encryptedBuffer;
    const encryptedSizeBytes = encryptedBuffer.length;

    // 6. Verify the newly generated archive in memory
    const verified = verifyEncryptedArchive(encryptedBuffer);
    if (!verified.isValid) {
      throw new Error(`Self-verification of newly generated backup failed: ${verified.error}`);
    }

    // 7. Record in BackupRecord in MongoDB Atlas (zero local path)
    const record = await BackupRecord.create({
      backupId,
      type,
      status: 'SUCCESS',
      filename: `${backupId}.imsbak`,
      plainSizeBytes,
      encryptedSizeBytes,
      checksumSha256: encryptionResult.sha256,
      databaseName: extraction.databaseName,
      totalCollections: extraction.totalCollections,
      totalDocuments: extraction.totalDocuments,
      collectionsSummary: extraction.collections.map((c) => ({
        name: c.name,
        documentCount: c.documentCount,
        indexCount: c.indexes.length,
      })),
      localPath: '',
      isLocalKept: false,
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
      verificationDetails: 'Cryptographic auth tag and SHA-256 checksum verified immediately after in-memory packaging.',
      createdBy,
    });

    // 8. Update config stats
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

    // 9. Audit log completion
    await BackupAuditLog.create({
      action: 'BACKUP_COMPLETED',
      status: 'SUCCESS',
      backupId,
      adminId: createdBy,
      details: {
        durationMs: Date.now() - startTime,
        plainSizeBytes,
        encryptedSizeBytes,
        totalCollections: extraction.totalCollections,
        totalDocuments: extraction.totalDocuments,
        inMemory: true,
      },
    }).catch(() => {});

    return {
      success: true,
      backupId,
      record,
      manifest,
      filePath: null,
      encryptedBuffer,
      checksumSha256: encryptionResult.sha256,
    };
  } catch (err) {
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
 * Validates, decrypts, and extracts manifest from an encrypted backup archive buffer in memory.
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
 * Restores a database backup archive into a target MongoDB database entirely in memory.
 * Zero disk files written, zero external CLI dependencies.
 */
async function restoreDatabase({
  backupRecordId = null,
  encryptedBuffer = null,
  isTest = true,
  targetDbName = null,
  customTargetUri = null,
  adminId = null,
  ip = '',
  selectedCollections = null,
  forceSafetySnapshot = false,
} = {}) {
  const startTime = Date.now();

  // 1. Resolve encrypted buffer
  let archiveBuffer = encryptedBuffer;

  if (!archiveBuffer) {
    throw new Error('Encrypted backup data was not provided for in-memory restore.');
  }

  // 2. Cryptographic Verification & Decryption in memory
  const verification = verifyEncryptedArchive(archiveBuffer);
  if (!verification.isValid) {
    await BackupAuditLog.create({
      action: 'RESTORE_FAILED',
      status: 'FAILURE',
      backupId: 'unknown',
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

  // 4. Pre-restore automatic safety backup in memory if this is a production restore and database is not empty
  let safetyBackupId = null;
  if (!isTest || forceSafetySnapshot) {
    try {
      const currentStats = await inspectDatabase().catch(() => null);
      if (currentStats && currentStats.totalDocuments > 0) {
        console.log('Taking automatic in-memory safety backup before production restoration...');
        const safetyBackup = await createDatabaseBackup({
          type: 'SAFETY_PRE_RESTORE',
          createdBy: adminId,
        });
        safetyBackupId = safetyBackup.backupId;

        // Upload safety snapshot directly to Google Drive (zero local file footprint)
        try {
          const googleDriveService = require('./googleDriveService');
          const config = await BackupConfig.findOne({ key: 'global_backup_config' });
          if (config?.googleDrive?.isConnected) {
            console.log('Uploading pre-restore safety snapshot directly to Google Drive...');
            const uploadRes = await googleDriveService.uploadBackupFile({
              fileName: `${safetyBackup.backupId}.imsbak`,
              fileBuffer: safetyBackup.encryptedBuffer,
              folderId: config.googleDrive.folderId,
              properties: {
                backupId: safetyBackup.backupId,
                sha256: safetyBackup.checksumSha256,
                isSafetySnapshot: 'true',
              },
            });
            if (uploadRes?.fileId) {
              await BackupRecord.updateOne(
                { backupId: safetyBackup.backupId },
                {
                  $set: {
                    'googleDrive.fileId': uploadRes.fileId,
                    'googleDrive.folderId': uploadRes.folderId,
                    'googleDrive.uploadedAt': new Date(),
                    'googleDrive.webContentLink': uploadRes.webContentLink,
                  },
                }
              );
            }
          }
        } catch (uploadErr) {
          console.warn('Notice: Could not upload safety snapshot to Google Drive:', uploadErr.message);
        }
      }
    } catch (safetyErr) {
      console.warn('Notice: Could not take safety backup:', safetyErr.message);
    }
  }

  // 5. Connect to destination database
  let targetDb = mongoose.connection.db;
  let closeTargetConn = null;

  if (isTest || destinationDbName !== sourceDbName || customTargetUri) {
    const baseUri = customTargetUri || process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_management3';
    const connStr = baseUri.includes('?')
      ? baseUri.replace(/\/([^/?]+)(\?.*)?$/, `/${destinationDbName}$2`)
      : baseUri.replace(/\/([^/?]+)$/, `/${destinationDbName}`);

    const targetConn = await mongoose.createConnection(connStr).asPromise();
    targetDb = targetConn.db;
    closeTargetConn = () => targetConn.close();
  }

  try {
    // 6. Decompress archive payload in memory
    const decompressed = zlib.gunzipSync(rawArchive);
    const hasSelective = Array.isArray(selectedCollections) && selectedCollections.length > 0;

    let collectionsList = [];
    if (decompressed.length > 0 && decompressed[0] === 0x7b) {
      // Modern in-memory Extended JSON backup format
      const backupPayload = JSON.parse(decompressed.toString('utf-8'));
      collectionsList = backupPayload.collections || [];
    } else if (
      decompressed.length >= 4 &&
      decompressed[0] === 0x6d &&
      decompressed[1] === 0xe2 &&
      decompressed[2] === 0x99 &&
      decompressed[3] === 0x81
    ) {
      // Legacy mongodump binary archive format (parsed 100% in-memory)
      collectionsList = parseMongodumpArchiveInMemory(decompressed);
    } else {
      throw new Error('Unsupported archive format: Unrecognized binary stream header.');
    }

    const collectionsToRestore = hasSelective
      ? collectionsList.filter((c) => selectedCollections.includes(c.name))
      : collectionsList;

    for (const colData of collectionsToRestore) {
      // Ensure collection exists even if it has 0 documents
      await targetDb.createCollection(colData.name).catch(() => {});
      const collObj = targetDb.collection(colData.name);

      // Drop existing data in this collection
      await collObj.deleteMany({});

      // Deserialize documents if needed (modern EJSON) or use directly if raw BSON objects
      if (colData.documents && colData.documents.length > 0) {
        const docs = colData.isRawDocs
          ? colData.documents
          : colData.documents.map((d) => mongoose.mongo.BSON.EJSON.deserialize(d, { relaxed: false }));

        // Bulk insert in chunks of 500 documents
        const CHUNK_SIZE = 500;
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          const chunk = docs.slice(i, i + CHUNK_SIZE);
          await collObj.insertMany(chunk, { ordered: false });
        }
      }

      // Recreate indexes
      if (colData.indexes && colData.indexes.length > 0) {
        for (const idx of colData.indexes) {
          if (idx.name !== '_id_' && idx.key) {
            let indexKey = idx.key;
            const indexOptions = {
              name: idx.name,
              unique: !!idx.unique,
              sparse: !!idx.sparse,
              background: true,
            };

            if (idx.weights && typeof idx.weights === 'object') {
              const textKey = {};
              for (const field of Object.keys(idx.weights)) {
                textKey[field] = 'text';
              }
              indexKey = textKey;
              if (idx.default_language) indexOptions.default_language = idx.default_language;
            }

            await collObj
              .createIndex(indexKey, indexOptions)
              .catch((e) => console.warn(`Index restore note for ${colData.name}.${idx.name}:`, e.message));
          }
        }
      }
    }

    // 7. Verify restored collections and document counts against manifest in memory
    const restoredStats = await inspectDatabase(targetDb);
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

    const isFullyVerified = discrepancies.length === 0;

    // 8. Audit log completion
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
    };
  } finally {
    if (closeTargetConn) {
      await closeTargetConn().catch(() => {});
    }
  }
}

module.exports = {
  BACKUPS_DIR,
  inspectDatabase,
  createDatabaseBackup,
  verifyEncryptedArchive,
  restoreDatabase,
};
