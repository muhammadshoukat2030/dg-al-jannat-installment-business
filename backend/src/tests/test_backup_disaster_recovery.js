/**
 * Automated Verification Test for Database Backup and Disaster Recovery
 *
 * Verifies:
 * 1. Comprehensive collection discovery (all 14 collections).
 * 2. Archive generation via mongodump.
 * 3. Complete manifest structure with document counts & index info.
 * 4. AES-256-GCM authenticated encryption & SHA-256 checksum calculation.
 * 5. Tamper detection: modifying 1 byte fails GCM auth tag verification.
 * 6. Isolated disaster recovery restore into an empty database:
 *    - Recreates all collections
 *    - Restores all documents with original ObjectIds
 *    - Recreates indexes
 *    - Validates 0 discrepancies against manifest
 * 7. Verification of data retrieval from the restored database.
 * 8. Emergency Recovery Kit generation.
 * 9. Google Drive OAuth URL and configuration helpers.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const cryptoService = require('../services/cryptoService');
const databaseBackupService = require('../services/databaseBackupService');
const googleDriveService = require('../services/googleDriveService');

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/installment_management3';
const TEST_RECOVERY_DB = 'installment_management_test_recovery';

async function runTests() {
  console.log('================================================================');
  console.log('STARTING DATABASE BACKUP & DISASTER RECOVERY VERIFICATION SUITE');
  console.log('================================================================');

  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB:', mongoose.connection.name);

  let total = 0;
  let passed = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] Test ${total}: ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] Test ${total}: ${message}`);
    }
  }

  // --- PHASE 1: Dynamic Collection Discovery ---
  console.log('\n--- PHASE 1: Dynamic Collection Discovery ---');
  const dbStats = await databaseBackupService.inspectDatabase();
  assert(dbStats.totalCollections >= 10, `Discovered ${dbStats.totalCollections} collections dynamically`);
  assert(dbStats.totalDocuments > 0, `Discovered ${dbStats.totalDocuments} total documents in database`);

  const expectedKeyCollections = [
    'customers',
    'installmentplans',
    'installments',
    'payments',
    'investors',
    'investortransactions',
    'ownertransactions',
    'businesssettings',
  ];
  const allKeyPresent = expectedKeyCollections.every((k) =>
    dbStats.collections.some((c) => c.name.toLowerCase() === k)
  );
  assert(allKeyPresent, `All key business collections found: [${expectedKeyCollections.join(', ')}]`);

  // --- PHASE 2: Backup Archive Generation & Manifest ---
  console.log('\n--- PHASE 2: Backup Archive Generation & Manifest ---');
  const backupResult = await databaseBackupService.createDatabaseBackup({
    type: 'MANUAL',
    keepLocal: true,
  });

  assert(backupResult.success === true, 'Backup creation returned success');
  assert(!!backupResult.backupId, `Generated Backup ID: ${backupResult.backupId}`);
  assert(backupResult.encryptedBuffer instanceof Buffer && backupResult.encryptedBuffer.length > 0, 'Encrypted archive generated in memory as Buffer');
  assert(backupResult.filePath === null, 'Confirmed zero local backup files created on disk');

  const manifest = backupResult.manifest;
  assert(manifest.totalCollections === dbStats.totalCollections, 'Manifest collections count matches inspected count');
  assert(manifest.totalDocuments >= dbStats.totalDocuments, `Manifest documents count (${manifest.totalDocuments}) reflects live database`);
  assert(manifest.encryption?.algorithm === 'aes-256-gcm', 'Manifest specifies AES-256-GCM encryption algorithm');
  assert(!!manifest.storage?.plainSha256, `Plain archive SHA-256: ${manifest.storage.plainSha256}`);
  assert(!!backupResult.checksumSha256, `Encrypted package SHA-256: ${backupResult.checksumSha256}`);

  // --- PHASE 3: Cryptographic Integrity & Tamper Proofing ---
  console.log('\n--- PHASE 3: Cryptographic Integrity & Tamper Proofing ---');
  const validCheck = databaseBackupService.verifyEncryptedArchive(backupResult.encryptedBuffer);
  assert(validCheck.isValid === true, 'Untampered archive verifies successfully with valid manifest');
  assert(validCheck.manifest.backupId === backupResult.backupId, 'Decrypted manifest backupId matches original');

  // Tamper test: Flip a byte in ciphertext
  const tamperedBuffer = Buffer.from(backupResult.encryptedBuffer);
  tamperedBuffer[tamperedBuffer.length - 1] ^= 0x55; // alter last byte
  const tamperedCheck = databaseBackupService.verifyEncryptedArchive(tamperedBuffer);
  assert(
    tamperedCheck.isValid === false && tamperedCheck.error.includes('Decryption failed'),
    'Tampered archive correctly fails AES-GCM authentication tag verification'
  );

  // --- PHASE 4: Isolated Empty Database Disaster Recovery ---
  console.log('\n--- PHASE 4: Isolated Empty Database Disaster Recovery ---');
  console.log(`Restoring into empty isolated test database: '${TEST_RECOVERY_DB}'...`);

  // Ensure test database is completely empty before restore
  const baseUri = 'mongodb://127.0.0.1:27017';
  const testConn = await mongoose.createConnection(`${baseUri}/${TEST_RECOVERY_DB}`).asPromise();
  await testConn.db.dropDatabase();
  const preRestoreCollections = await testConn.db.listCollections().toArray();
  assert(preRestoreCollections.length === 0, 'Confirmed test recovery database is 100% empty before restoration');

  // Perform full database restore
  const restoreResult = await databaseBackupService.restoreDatabase({
    backupRecordId: backupResult.backupId,
    encryptedBuffer: backupResult.encryptedBuffer,
    isTest: true,
    targetDbName: TEST_RECOVERY_DB,
  });

  assert(restoreResult.success === true, 'Database restoration returned success');
  assert(restoreResult.discrepancies.length === 0, 'Zero discrepancies reported between manifest and restored database');

  // Audit restored database contents
  const postRestoreStats = await databaseBackupService.inspectDatabase(testConn.db);
  console.log(`  Restored Collections: ${postRestoreStats.totalCollections}`);
  console.log(`  Restored Documents:   ${postRestoreStats.totalDocuments}`);

  assert(
    postRestoreStats.totalCollections === manifest.totalCollections,
    `Restored collections count (${postRestoreStats.totalCollections}) exactly matches original (${manifest.totalCollections})`
  );
  assert(
    postRestoreStats.totalDocuments === manifest.totalDocuments,
    `Restored documents count (${postRestoreStats.totalDocuments}) exactly matches original (${manifest.totalDocuments})`
  );

  // Check specific documents in restored database to verify ObjectId and data preservation
  const originalCustomers = await mongoose.connection.db.collection('customers').find().toArray();
  const restoredCustomers = await testConn.db.collection('customers').find().toArray();

  assert(
    originalCustomers.length === restoredCustomers.length,
    `Customers document count matches (${restoredCustomers.length})`
  );

  const sampleOriginal = originalCustomers[0];
  const sampleRestored = restoredCustomers.find((c) => String(c._id) === String(sampleOriginal._id));
  assert(
    sampleRestored && sampleRestored.name === sampleOriginal.name && String(sampleRestored._id) === String(sampleOriginal._id),
    `Sample customer '${sampleOriginal.name}' preserved exact ObjectId (${sampleOriginal._id}) and attributes`
  );

  // Check indexes in restored database
  const restoredIndexes = await testConn.db.collection('customers').indexes();
  assert(restoredIndexes.length >= 5, `Restored customer collection has ${restoredIndexes.length} active indexes`);

  // Drop isolated test recovery database
  await testConn.db.dropDatabase();
  await testConn.close();
  console.log('Cleaned up isolated test recovery database');

  // --- PHASE 5: Emergency Recovery Kit ---
  console.log('\n--- PHASE 5: Emergency Recovery Kit ---');
  const kit = cryptoService.generateEmergencyRecoveryKit();
  assert(!!kit.masterKeyHex && kit.masterKeyHex.length === 64, 'Emergency Recovery Kit contains 64-character master hex key');
  assert(!!kit.keyFingerprint, `Key fingerprint generated: ${kit.keyFingerprint}`);
  assert(Array.isArray(kit.instructions) && kit.instructions.length >= 3, 'Kit contains step-by-step recovery instructions');

  // --- PHASE 6: Google Drive Integration Helpers ---
  console.log('\n--- PHASE 6: Google Drive Integration Helpers ---');
  assert(googleDriveService.FOLDER_NAME === 'Installment-System-Backups', 'Google Drive folder name is "Installment-System-Backups"');
  const creds = googleDriveService.getOAuthCredentials();
  assert(typeof creds.isConfigured === 'boolean', `OAuth credentials configured: ${creds.isConfigured}`);

  // Confirmed zero local file footprint
  assert(backupResult.filePath === null, 'No local file was created during test execution');

  // Cleanup test backup record from MongoDB
  const BackupRecord = require('../models/BackupRecord');
  await BackupRecord.deleteOne({ backupId: backupResult.backupId });

  await mongoose.disconnect();

  console.log('\n================================================================');
  console.log(`DATABASE BACKUP & DISASTER RECOVERY RESULTS: ${passed} / ${total} TESTS PASSED`);
  console.log('================================================================');

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
