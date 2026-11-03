#!/usr/bin/env node

/**
 * Standalone Offline Emergency Database Disaster Recovery CLI
 *
 * Use this tool when your server or web application is completely down, or if
 * MongoDB Atlas was wiped clean and you need to restore directly from a local
 * or downloaded Google Drive .imsbak archive file.
 *
 * Usage:
 *   node backend/src/utils/emergencyRestoreCLI.js <path-to-backup.imsbak> [options]
 *
 * Options:
 *   --production     Perform actual restore to production database (default is isolated test restore)
 *   --confirm        Confirm that you understand this will restore into the targeted database
 *   --key <hexKey>   Provide AES-256-GCM hex key (defaults to BACKUP_ENCRYPTION_KEY or .env)
 *   --uri <mongoUri> Custom MongoDB connection URI
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
const cryptoService = require('../services/cryptoService');
const databaseBackupService = require('../services/databaseBackupService');

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
================================================================================
  INSTALLMENT SYSTEM — STANDALONE EMERGENCY DATABASE RESTORE CLI
================================================================================

Usage:
  node backend/src/utils/emergencyRestoreCLI.js <archive-file.imsbak> [flags]

Flags:
  --production        Restore directly into production database (Default is isolated test)
  --confirm           Bypass interactive confirmation prompt
  --key <32-byte-hex> Master encryption key (defaults to BACKUP_ENCRYPTION_KEY from .env)
  --uri <mongo-uri>   Target MongoDB connection URI (defaults to MONGODB_URI from .env)

Examples:
  1. Safe isolated test restore:
     node backend/src/utils/emergencyRestoreCLI.js ./backups/ims_bak_sample.imsbak

  2. Full production disaster recovery:
     node backend/src/utils/emergencyRestoreCLI.js ./backups/ims_bak_sample.imsbak --production --confirm
================================================================================
`);
    process.exit(0);
  }

  const archivePath = path.resolve(args[0]);
  if (!fs.existsSync(archivePath)) {
    console.error(`❌ Error: Backup archive file not found at: ${archivePath}`);
    process.exit(1);
  }

  const isProduction = args.includes('--production');
  const hasConfirm = args.includes('--confirm');

  // Parse optional custom key
  const keyIdx = args.indexOf('--key');
  let customKey = null;
  if (keyIdx !== -1 && args[keyIdx + 1]) {
    customKey = Buffer.from(args[keyIdx + 1], 'hex');
  }

  // Parse optional custom URI
  const uriIdx = args.indexOf('--uri');
  let customUri = null;
  if (uriIdx !== -1 && args[uriIdx + 1]) {
    customUri = args[uriIdx + 1];
  }

  console.log('================================================================================');
  console.log('  STANDALONE EMERGENCY DATABASE RESTORATION');
  console.log('================================================================================');
  console.log(`Archive: ${archivePath}`);
  console.log(`Mode:    ${isProduction ? '⚠️  PRODUCTION RESTORATION' : '✅ ISOLATED TEST RESTORATION'}`);
  console.log(`Key:     ${cryptoService.getKeyFingerprint(customKey)}`);
  console.log('--------------------------------------------------------------------------------\n');

  if (isProduction && !hasConfirm) {
    console.error('⚠️  CRITICAL SAFETY WARNING:');
    console.error('You are about to restore an archive into the PRODUCTION database.');
    console.error('To proceed, re-run this command with the --confirm flag:');
    console.error(`  node backend/src/utils/emergencyRestoreCLI.js "${archivePath}" --production --confirm\n`);
    process.exit(1);
  }

  console.log('Step 1: Reading encrypted archive file...');
  const encryptedBuffer = fs.readFileSync(archivePath);
  console.log(`  Read ${encryptedBuffer.length} bytes.\n`);

  console.log('Step 2: Cryptographic validation & BSON manifest verification...');
  const verification = databaseBackupService.verifyEncryptedArchive(encryptedBuffer, customKey);
  if (!verification.isValid) {
    console.error(`❌ Decryption / Integrity Check FAILED: ${verification.error}`);
    process.exit(1);
  }

  const manifest = verification.manifest;
  console.log(`  ✅ Archive is valid and untampered!`);
  console.log(`  Backup ID:   ${manifest.backupId}`);
  console.log(`  Created:     ${manifest.createdAt}`);
  console.log(`  Collections: ${manifest.totalCollections}`);
  console.log(`  Documents:   ${manifest.totalDocuments}\n`);

  console.log(`Step 3: Restoring into ${isProduction ? 'PRODUCTION DATABASE' : 'TEST RECOVERY DATABASE'}...`);
  const result = await databaseBackupService.restoreDatabase({
    encryptedBuffer,
    isTest: !isProduction,
    customKey,
    customTargetUri: customUri,
  });

  console.log('--------------------------------------------------------------------------------');
  if (result.success) {
    console.log('🎉 RESTORATION COMPLETED SUCCESSFULLY WITH 100% DATA PARITY!');
    console.log(`Target Database:     ${result.targetDbName}`);
    console.log(`Restored Collections: ${result.restoredCollections}`);
    console.log(`Restored Documents:   ${result.restoredDocuments}`);
    if (result.safetyBackupId) {
      console.log(`Safety Snapshot ID:   ${result.safetyBackupId}`);
    }
  } else {
    console.error('⚠️  RESTORATION COMPLETED WITH DISCREPANCIES:');
    result.discrepancies.forEach((d) => console.error(`  • ${d}`));
  }
  console.log('================================================================================\n');

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
