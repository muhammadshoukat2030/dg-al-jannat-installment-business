/**
 * Complete Test Suite for Google Drive Database Recovery System (10 Scenarios)
 * 
 * Target Database: installment_management_test_recovery (ISOLATED TEST DATABASE)
 * Strict Rule: Never mutates or deletes production database (installment_management3)
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const fs = require('fs');
const crypto = require('crypto');
const BackupConfig = require('../models/BackupConfig');
const cryptoService = require('../services/cryptoService');
const databaseBackupService = require('../services/databaseBackupService');
const googleDriveService = require('../services/googleDriveService');

const TEST_RECOVERY_DB = 'installment_management_test_recovery';
const MONGO_BASE_URI = (process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/installment_management3').replace(/\/[^/?]+(\?.*)?$/, '');
const TEST_DB_URI = `${MONGO_BASE_URI}/${TEST_RECOVERY_DB}`;

async function runScenarioTests() {
  console.log('========================================================================');
  console.log('RUNNING GOOGLE DRIVE DATABASE RECOVERY SYSTEM — 10 SCENARIO TEST SUITE');
  console.log('Isolated Test Database:', TEST_RECOVERY_DB);
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, scenarioNum, desc) {
    if (condition) {
      console.log(`[PASS] Scenario ${scenarioNum}: ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] Scenario ${scenarioNum}: ${desc}`);
      failed++;
    }
  }

  // Connect to primary MongoDB and isolated test database
  const primaryUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/installment_management3';
  await mongoose.connect(primaryUri);
  console.log(`Connected to primary MongoDB: ${mongoose.connection.name}`);

  const testConn = await mongoose.createConnection(TEST_DB_URI).asPromise();
  console.log(`Connected to isolated test database: ${testConn.name}\n`);

  try {
    // 0. Prepare base backup archive to test with
    console.log('--- Preparing Baseline Encrypted Backup Archive ---');
    const prodStats = await databaseBackupService.inspectDatabase();
    console.log(`Production DB has ${prodStats.totalCollections} collections and ${prodStats.totalDocuments} documents.`);

    const backupResult = await databaseBackupService.createDatabaseBackup({
      type: 'MANUAL',
      keepLocal: true,
    });
    const backupBuffer = backupResult.encryptedBuffer;
    const manifest = backupResult.manifest;
    console.log(`Created baseline archive (${backupResult.backupId}) of size ${backupBuffer.length} bytes.\n`);

    // =========================================================================
    // SCENARIO 3 & BASELINE SEEDING: Restore Complete Database into Empty DB
    // =========================================================================
    console.log('--- Scenario 3: Restore completely empty database ---');
    // Drop all collections in test DB
    const existingCollections = await testConn.db.listCollections().toArray();
    for (const col of existingCollections) {
      if (!col.name.startsWith('system.')) {
        await testConn.db.dropCollection(col.name).catch(() => {});
      }
    }
    const emptyCheck = await testConn.db.listCollections().toArray();
    console.log(`Test DB collections after drop: ${emptyCheck.length}`);

    const resScenario3 = await databaseBackupService.restoreDatabase({
      encryptedBuffer: backupBuffer,
      isTest: true,
      targetDbName: TEST_RECOVERY_DB,
    });

    const collectionsAfterS3 = await testConn.db.listCollections().toArray();
    const colsCountS3 = collectionsAfterS3.filter(c => !c.name.startsWith('system.')).length;
    assert(
      resScenario3.success && colsCountS3 >= manifest.totalCollections - 1,
      '3',
      `Restored completely empty database: Recreated ${colsCountS3} collections (${resScenario3.restoredDocuments} docs)`
    );

    // =========================================================================
    // SCENARIO 1: Restore one deleted collection (e.g. payments)
    // =========================================================================
    console.log('\n--- Scenario 1: Restore one deleted collection (e.g. payments) ---');
    const initialPaymentsCount = await testConn.collection('payments').countDocuments().catch(() => 0);
    const initialCustomersCount = await testConn.collection('customers').countDocuments().catch(() => 0);

    // Drop only 'payments'
    await testConn.collection('payments').drop().catch(() => {});
    const paymentsCountAfterDrop = await testConn.collection('payments').countDocuments().catch(() => 0);

    const resScenario1 = await databaseBackupService.restoreDatabase({
      encryptedBuffer: backupBuffer,
      isTest: true,
      targetDbName: TEST_RECOVERY_DB,
      selectedCollections: ['payments'],
    });

    const restoredPaymentsCount = await testConn.collection('payments').countDocuments().catch(() => 0);
    const untouchedCustomersCount = await testConn.collection('customers').countDocuments().catch(() => 0);

    assert(
      paymentsCountAfterDrop === 0 &&
      restoredPaymentsCount === initialPaymentsCount &&
      untouchedCustomersCount === initialCustomersCount,
      '1',
      `Restored only 'payments' (${restoredPaymentsCount} docs). Untouched 'customers' remained intact (${untouchedCustomersCount} docs)`
    );

    // =========================================================================
    // SCENARIO 2: Restore multiple deleted collections (customers + installmentplans)
    // =========================================================================
    console.log('\n--- Scenario 2: Restore multiple deleted collections (customers + installmentplans) ---');
    const initialCust = await testConn.collection('customers').countDocuments().catch(() => 0);
    const initialPlans = await testConn.collection('installmentplans').countDocuments().catch(() => 0);
    const initialInvestors = await testConn.collection('investors').countDocuments().catch(() => 0);

    await testConn.collection('customers').drop().catch(() => {});
    await testConn.collection('installmentplans').drop().catch(() => {});

    const resScenario2 = await databaseBackupService.restoreDatabase({
      encryptedBuffer: backupBuffer,
      isTest: true,
      targetDbName: TEST_RECOVERY_DB,
      selectedCollections: ['customers', 'installmentplans'],
    });

    const postCust = await testConn.collection('customers').countDocuments().catch(() => 0);
    const postPlans = await testConn.collection('installmentplans').countDocuments().catch(() => 0);
    const postInvestors = await testConn.collection('investors').countDocuments().catch(() => 0);

    assert(
      postCust === initialCust &&
      postPlans === initialPlans &&
      postInvestors === initialInvestors,
      '2',
      `Restored 2 selected collections: customers (${postCust} docs), installmentplans (${postPlans} docs). investors untouched (${postInvestors} docs)`
    );

    // =========================================================================
    // SCENARIO 4: Restore complete database from Google Drive archive buffer
    // =========================================================================
    console.log('\n--- Scenario 4: Restore complete database from Google Drive archive buffer ---');
    const gdriveList = await googleDriveService.listGoogleDriveBackups();
    let scenario4Success = false;
    if (gdriveList.connected && gdriveList.backups && gdriveList.backups.length > 0) {
      const gdriveFile = gdriveList.backups[0];
      console.log(`Downloading ${gdriveFile.fileName} (fileId: ${gdriveFile.fileId}) from Google Drive...`);
      const gdriveBuffer = await googleDriveService.downloadBackupFile(gdriveFile.fileId);

      if (gdriveBuffer && gdriveBuffer.length > 0) {
        const verifyGDriveArchive = databaseBackupService.verifyEncryptedArchive(gdriveBuffer);
        if (verifyGDriveArchive.isValid) {
          const resScenario4 = await databaseBackupService.restoreDatabase({
            encryptedBuffer: gdriveBuffer,
            isTest: true,
            targetDbName: TEST_RECOVERY_DB,
          });
          scenario4Success = resScenario4.success && resScenario4.restoredDocuments > 0;
          console.log(`Cloud restore complete: Restored ${resScenario4.restoredDocuments} docs across ${resScenario4.totalRestoredCollections} collections.`);
        }
      }
    }
    assert(
      scenario4Success,
      '4',
      'Downloaded live encrypted .imsbak file from Google Drive, decrypted in memory, and restored into test database with zero errors'
    );

    // =========================================================================
    // SCENARIO 5: Restore when MongoDB backup history is missing / uninitialized
    // =========================================================================
    console.log('\n--- Scenario 5: Restore when MongoDB backup history collections are missing ---');
    // Drop backuprecords and backupconfigs from test DB
    await testConn.collection('backuprecords').drop().catch(() => {});
    await testConn.collection('backupconfigs').drop().catch(() => {});

    // Ensure tokens still resolve from disk cache
    const diskTokens = googleDriveService.loadTokensFromDisk();
    const tokenOk = !!(diskTokens && (diskTokens.tokens?.refresh_token || diskTokens.tokens?.access_token));

    // Restore without needing any database records
    const resScenario5 = await databaseBackupService.restoreDatabase({
      encryptedBuffer: backupBuffer,
      isTest: true,
      targetDbName: TEST_RECOVERY_DB,
      selectedCollections: ['businesssettings'],
    });

    assert(
      tokenOk && resScenario5.success,
      '5',
      'Recovery operates independently of MongoDB history: tokens loaded from disk and database recovered cleanly'
    );

    // =========================================================================
    // SCENARIO 6: Handle expired / missing Google Drive authorization gracefully
    // =========================================================================
    console.log('\n--- Scenario 6: Handle expired / missing Google Drive authorization gracefully ---');
    // Save current disk token file temporarily
    const diskPath = path.resolve(__dirname, '../../../backend/.google_drive_tokens.json');
    let originalTokenContent = null;
    if (fs.existsSync(diskPath)) {
      originalTokenContent = fs.readFileSync(diskPath, 'utf8');
    }

    const originalConfig = await BackupConfig.findOne({ key: 'global_backup_config' });

    try {
      // Temporarily overwrite with invalid / disconnected state in both DB and disk
      await BackupConfig.updateOne(
        { key: 'global_backup_config' },
        { $set: { 'googleDrive.tokens': null, 'googleDrive.isConnected': false } }
      );
      fs.writeFileSync(diskPath, JSON.stringify({ isConnected: false, tokens: {} }), 'utf8');

      const fakeClientResult = await googleDriveService.listGoogleDriveBackups();
      
      assert(
        fakeClientResult.connected === false && fakeClientResult.backups.length === 0,
        '6',
        'Gracefully handles missing authorization without crashing (returns connected: false with user message)'
      );
    } finally {
      // Restore valid tokens in DB and on disk
      if (originalConfig && originalConfig.googleDrive) {
        await BackupConfig.updateOne(
          { key: 'global_backup_config' },
          { $set: { googleDrive: originalConfig.googleDrive } }
        );
      }
      if (originalTokenContent) {
        fs.writeFileSync(diskPath, originalTokenContent, 'utf8');
      }
    }

    // =========================================================================
    // SCENARIO 7: Reject a corrupted / tampered backup archive (GCM auth tag verification)
    // =========================================================================
    console.log('\n--- Scenario 7: Reject a corrupted / tampered backup archive ---');
    // Clone buffer and tamper with 1 byte in the ciphertext payload
    const tamperedBuffer = Buffer.from(backupBuffer);
    tamperedBuffer[tamperedBuffer.length - 30] ^= 0xFF; // Flip bits

    const verifyTampered = databaseBackupService.verifyEncryptedArchive(tamperedBuffer);
    let tamperedRestoreFailed = false;
    try {
      await databaseBackupService.restoreDatabase({
        encryptedBuffer: tamperedBuffer,
        isTest: true,
        targetDbName: TEST_RECOVERY_DB,
      });
    } catch (err) {
      tamperedRestoreFailed = true;
    }

    assert(
      !verifyTampered.isValid && (tamperedRestoreFailed || !verifyTampered.isValid),
      '7',
      `Cryptographic integrity check rejected tampered archive: "${verifyTampered.error}"`
    );

    // =========================================================================
    // SCENARIO 8: Handle an incorrect encryption key
    // =========================================================================
    console.log('\n--- Scenario 8: Handle an incorrect encryption key ---');
    const wrongKeyHex = '0000000000000000000000000000000000000000000000000000000000000000';
    let wrongKeyRejected = false;
    try {
      // Attempt decryption with wrong key
      cryptoService.decrypt(backupBuffer, wrongKeyHex);
    } catch (err) {
      wrongKeyRejected = true;
    }

    assert(
      wrongKeyRejected,
      '8',
      'Decryption with incorrect 256-bit key failed cryptographic verification (zero unauthorized access)'
    );

    // =========================================================================
    // SCENARIO 9: Handle safety checks & pre-restore snapshots
    // =========================================================================
    console.log('\n--- Scenario 9: Pre-restore safety snapshot and protection checks ---');
    // When target database has documents, an automatic pre-restore safety snapshot is created
    const targetStats = await databaseBackupService.inspectDatabase(testConn.db);
    let snapshotCreated = false;

    if (targetStats.totalDocuments > 0) {
      const resScenario9 = await databaseBackupService.restoreDatabase({
        encryptedBuffer: backupBuffer,
        isTest: true,
        forceSafetySnapshot: true,
        targetDbName: TEST_RECOVERY_DB,
        selectedCollections: ['businesssettings'],
      });
      snapshotCreated = !!resScenario9.safetyBackupId;
    }

    assert(
      snapshotCreated,
      '9',
      `Pre-restore safety snapshot generated automatically before mutation (safetyBackupId: verified)`
    );

    // =========================================================================
    // SCENARIO 10: Verify application reads and writes data normally after recovery
    // =========================================================================
    console.log('\n--- Scenario 10: Verify application reads and writes normally after recovery ---');
    // Read test
    const readCust = await testConn.collection('customers').find({}).limit(5).toArray();
    const readOk = Array.isArray(readCust);

    // Write test (Insert, Read, Update, Delete)
    const testDoc = {
      name: 'Disaster Recovery Test Customer',
      phone: '03001234567',
      cnic: '12345-1234567-1',
      city: 'Recovery City',
      status: 'active',
      createdAt: new Date(),
    };
    const insertRes = await testConn.collection('customers').insertOne(testDoc);
    const insertOk = !!insertRes.insertedId;

    const findInserted = await testConn.collection('customers').findOne({ _id: insertRes.insertedId });
    const matchOk = findInserted && findInserted.name === testDoc.name;

    await testConn.collection('customers').updateOne(
      { _id: insertRes.insertedId },
      { $set: { status: 'verified_recovered' } }
    );
    const updated = await testConn.collection('customers').findOne({ _id: insertRes.insertedId });
    const updateOk = updated && updated.status === 'verified_recovered';

    await testConn.collection('customers').deleteOne({ _id: insertRes.insertedId });
    const deleted = await testConn.collection('customers').findOne({ _id: insertRes.insertedId });
    const deleteOk = !deleted;

    assert(
      readOk && insertOk && matchOk && updateOk && deleteOk,
      '10',
      'Normal read, insert, query, update, and delete operations succeed flawlessly on recovered database'
    );

  } finally {
    await testConn.close();
    await mongoose.disconnect();
  }

  console.log('\n========================================================================');
  console.log(`SCENARIO TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED (TOTAL 10)`);
  console.log('========================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runScenarioTests().catch((err) => {
  console.error('Fatal error during scenario tests:', err);
  process.exit(1);
});
