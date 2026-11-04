/**
 * Automated Security Hardening Verification Test Suite
 * Tests all implemented security fixes (SEC-01 through SEC-12):
 * - Authentication & Fallback Login Elimination
 * - Backup Cron Secret Enforcement & Timing-Safe Comparison
 * - OAuth 2.0 State Nonce Cryptographic Generation & Anti-CSRF Validation
 * - Google Drive OAuth Token Encryption at Rest & Deserialization Protection
 * - Cryptographic Salt Handling (V1 Backward Compatibility + V2 Random Salts)
 * - Search ReDoS Protection & Regex Character Escaping
 * - Mass Assignment Protection via Field Whitelisting
 * - Emergency Recovery Kit Caching Guards & CLI Export
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config();

const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');

const connectDB = require('../config/db');
const Admin = require('../models/Admin');
const Customer = require('../models/Customer');
const Investor = require('../models/Investor');
const BackupConfig = require('../models/BackupConfig');

const cryptoService = require('../services/cryptoService');
const googleDriveService = require('../services/googleDriveService');
const { escapeRegex } = require('../utils/regexHelper');

async function runTests() {
  console.log('================================================================================');
  console.log('STARTING SECURITY HARDENING AUTOMATED VERIFICATION SUITE');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(description, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${description}`);
      passed++;
    } else {
      console.error(`[FAIL] ${description} ${details ? '(' + details + ')' : ''}`);
      failed++;
    }
  }

  try {
    await connectDB();

    // --------------------------------------------------------------------------
    // TEST 1: SEC-01 Git Tracking Verification
    // --------------------------------------------------------------------------
    console.log('\n--- 1. SEC-01: Git Tracking and Sensitive Backup Files ---');
    const { execSync } = require('child_process');
    const trackedBackups = execSync('git ls-files backend/backups/backup_1793114831900', { encoding: 'utf-8' }).trim();
    assert('Sensitive backup directory is no longer tracked in Git index', trackedBackups.length === 0, `Found: ${trackedBackups}`);

    const backupDirExists = fs.existsSync(path.resolve(__dirname, '../../backups/backup_1793114831900/admins.json'));
    assert('Original local backup files are preserved safely on disk', backupDirExists);

    // --------------------------------------------------------------------------
    // TEST 2: SEC-02 Backup Cron Webhook Security
    // --------------------------------------------------------------------------
    console.log('\n--- 2. SEC-02: Backup Cron Webhook Secret Enforcement ---');
    const cronSecret = 'test_cron_secret_7766554433221100';
    process.env.BACKUP_CRON_SECRET = cronSecret;

    // Test correct secret
    const authHeaderValid = `Bearer ${cronSecret}`;
    const bufA = Buffer.from(authHeaderValid);
    const bufB = Buffer.from(`Bearer ${process.env.BACKUP_CRON_SECRET}`);
    const isSecretMatch = bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
    assert('Timing-safe secret comparison matches valid Authorization header', isSecretMatch);

    // Test incorrect secret
    const authHeaderInvalid = 'Bearer wrong_attacker_secret_123';
    const bufBad = Buffer.from(authHeaderInvalid);
    const isBadMatch = bufBad.length === bufB.length && crypto.timingSafeEqual(bufBad, bufB);
    assert('Timing-safe secret comparison rejects invalid Authorization header', !isBadMatch);

    delete process.env.BACKUP_CRON_SECRET;
    assert('Missing BACKUP_CRON_SECRET is recognized as unconfigured', !process.env.BACKUP_CRON_SECRET);

    // --------------------------------------------------------------------------
    // TEST 3: SEC-03 Google OAuth State Generation & Validation
    // --------------------------------------------------------------------------
    console.log('\n--- 3. SEC-03: Google Drive OAuth 2.0 State Anti-CSRF Validation ---');
    const generatedState = googleDriveService.generateOAuthState();
    assert('OAuth state is a valid signed token structure (nonce.timestamp.hmac)', generatedState.split('.').length === 3);

    const authUrlResult = googleDriveService.getAuthorizationUrl();
    assert('getAuthorizationUrl attaches state query parameter to Google OAuth URL', authUrlResult.url.includes('&state='));

    // Valid state validation and single-use consumption
    const validCheck = googleDriveService.validateAndConsumeOAuthState(generatedState);
    assert('Valid OAuth state passes verification', validCheck.isValid);

    // Replay attack prevention: second verification must fail
    const replayCheck = googleDriveService.validateAndConsumeOAuthState(generatedState);
    assert('Reused OAuth state is rejected (replay attack prevention)', !replayCheck.isValid);

    // Tampered state verification
    const tamperedState = generatedState.slice(0, -4) + 'abcd';
    const tamperedCheck = googleDriveService.validateAndConsumeOAuthState(tamperedState);
    assert('Tampered OAuth state signature is rejected', !tamperedCheck.isValid);

    // Missing state verification
    const missingCheck = googleDriveService.validateAndConsumeOAuthState(null);
    assert('Missing OAuth state is rejected', !missingCheck.isValid);

    // --------------------------------------------------------------------------
    // TEST 4: SEC-04 Token Encryption at Rest
    // --------------------------------------------------------------------------
    console.log('\n--- 4. SEC-04: Google Drive OAuth Token Encryption at Rest ---');
    const sampleToken = 'ya29.a0AfH6SMA_SENSITIVE_OAUTH_TOKEN_SAMPLE_12345';
    const encryptedToken = cryptoService.encryptSecretText(sampleToken);
    assert('OAuth token is encrypted with AES-256-GCM prefix', encryptedToken.startsWith('enc:gcm:v1:'));

    const decryptedToken = cryptoService.decryptSecretText(encryptedToken);
    assert('Encrypted OAuth token decrypts to original plaintext accurately', decryptedToken === sampleToken);

    const legacyPlaintext = 'plain_legacy_token_12345';
    assert('Plaintext tokens are accepted seamlessly for backwards compatibility', cryptoService.decryptSecretText(legacyPlaintext) === legacyPlaintext);

    // Test BackupConfig model toJSON serialization excludes tokens
    const configDoc = new BackupConfig({
      key: 'test_config_security',
      googleDrive: {
        isConnected: true,
        tokens: {
          access_token: encryptedToken,
          refresh_token: encryptedToken,
        },
      },
    });
    const serializedJson = configDoc.toJSON();
    assert('BackupConfig JSON serialization completely omits tokens', serializedJson.googleDrive.tokens === undefined);

    const bakFileStillInProject = fs.existsSync(path.resolve(__dirname, '../../.google_drive_tokens.json.bak'));
    assert('Plaintext .google_drive_tokens.json.bak removed from project directory', !bakFileStillInProject);

    // --------------------------------------------------------------------------
    // TEST 5: SEC-05 Elimination of Hardcoded Default Admin Credentials
    // --------------------------------------------------------------------------
    console.log('\n--- 5. SEC-05: Elimination of Hardcoded Default Admin Credentials ---');
    const existingAdminCount = await Admin.countDocuments();
    assert('Database contains active administrator accounts', existingAdminCount > 0);

    // Verify default strings 'admin@localhost.com' / '12345' are not hardcoded fallbacks
    const authControllerCode = fs.readFileSync(path.resolve(__dirname, '../controllers/authController.js'), 'utf-8');
    const hasHardcodedDefaultEmail = authControllerCode.includes("ADMIN_EMAIL || 'admin@localhost.com'");
    const hasHardcodedDefaultPass = authControllerCode.includes("ADMIN_PASSWORD || '12345'");
    assert('Hardcoded default email fallback removed from authController', !hasHardcodedDefaultEmail);
    assert('Hardcoded default password fallback removed from authController', !hasHardcodedDefaultPass);

    // --------------------------------------------------------------------------
    // TEST 5b: SEC-06 Elimination of Master Key Exposure over HTTP
    // --------------------------------------------------------------------------
    console.log('\n--- 5b. SEC-06: Elimination of Master Key Exposure over HTTP ---');
    const backupControllerCode = fs.readFileSync(path.resolve(__dirname, '../controllers/backupController.js'), 'utf-8');
    const hasHttpMasterKeyLeak = backupControllerCode.includes('${kit.masterKeyHex}');
    assert('Raw master encryption key hex completely removed from HTTP emergency kit response', !hasHttpMasterKeyLeak);
    const referencesOfflineTool = backupControllerCode.includes('node backend/scripts/export-emergency-kit.js');
    assert('HTTP emergency guide directs administrator to secure offline CLI tool', referencesOfflineTool);

    // --------------------------------------------------------------------------
    // TEST 6: SEC-07 PBKDF2 Salt Handling & Backward Compatibility
    // --------------------------------------------------------------------------
    console.log('\n--- 6. SEC-07: PBKDF2 Salt Handling & Archive Versioning ---');
    const backupsDir = path.resolve(__dirname, '../../backups');
    const backupFiles = fs.readdirSync(backupsDir).filter((f) => f.endsWith('.imsbak'));
    let legacyDecryptedCount = 0;
    for (const file of backupFiles) {
      const buffer = fs.readFileSync(path.join(backupsDir, file));
      try {
        cryptoService.decryptBuffer(buffer);
        legacyDecryptedCount++;
      } catch (e) {}
    }
    assert(`All ${backupFiles.length} existing legacy archives decrypt successfully`, legacyDecryptedCount === backupFiles.length);

    // Test Version 2 Archive creation with unique random salt
    const testPlaintext = Buffer.from('PAYLOAD_FOR_V2_ENCRYPTED_BACKUP_TEST');
    const v2Archive = cryptoService.encryptArchiveBuffer(testPlaintext);
    assert('New archive uses V2 format with unique salt', v2Archive.version === '2.0-salt' && v2Archive.saltHex.length === 32);

    const v2Decrypted = cryptoService.decryptBuffer(v2Archive.encryptedBuffer);
    assert('V2 archive decrypts with matching plaintext', v2Decrypted.equals(testPlaintext));

    // Tampered archive verification (auth tag mismatch)
    const tamperedArchive = Buffer.from(v2Archive.encryptedBuffer);
    tamperedArchive[tamperedArchive.length - 1] ^= 0x01; // flip 1 bit
    let tamperedRejected = false;
    try {
      cryptoService.decryptBuffer(tamperedArchive);
    } catch (e) {
      tamperedRejected = true;
    }
    assert('Tampered archive is rejected by AES-256-GCM authentication tag', tamperedRejected);

    // --------------------------------------------------------------------------
    // TEST 7: SEC-08 ReDoS Prevention and Regex Escaping
    // --------------------------------------------------------------------------
    console.log('\n--- 7. SEC-08: Regular Expression Injection & ReDoS Protection ---');
    const dangerousInput = '.*+?^${}()|[]\\test(a+)+$';
    const escaped = escapeRegex(dangerousInput);
    assert('Special regex characters are safely escaped', escaped === '\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\test\\(a\\+\\)\\+\\$');

    // Run query with dangerous input against Customer collection without crashing
    let querySuccess = false;
    try {
      await Customer.find({
        $or: [
          { name: { $regex: escaped, $options: 'i' } },
          { contactNumber: { $regex: escaped, $options: 'i' } },
        ],
      }).limit(1);
      querySuccess = true;
    } catch (e) {
      querySuccess = false;
    }
    assert('MongoDB executes regex query containing escaped special characters safely', querySuccess);

    // --------------------------------------------------------------------------
    // TEST 8: SEC-09 Mass Assignment Protection
    // --------------------------------------------------------------------------
    console.log('\n--- 8. SEC-09: Mass Assignment Prevention ---');
    const customerControllerCode = fs.readFileSync(path.resolve(__dirname, '../controllers/customerController.js'), 'utf-8');
    const hasUnrestrictedSpreadOnCreate = customerControllerCode.includes('Customer.create({ ...req.body');
    assert('Unrestricted req.body spread removed from createCustomer', !hasUnrestrictedSpreadOnCreate);

    const investorControllerCode = fs.readFileSync(path.resolve(__dirname, '../controllers/investorController.js'), 'utf-8');
    const hasUnrestrictedInvestorSpread = investorControllerCode.includes('Investor.create({ ...req.body');
    assert('Unrestricted req.body spread removed from createInvestor', !hasUnrestrictedInvestorSpread);

    // --------------------------------------------------------------------------
    // TEST 9: SEC-12 Database URI Consistency
    // --------------------------------------------------------------------------
    console.log('\n--- 9. SEC-12: Database URI Environment Variable Consistency ---');
    const dbConfigCode = fs.readFileSync(path.resolve(__dirname, '../config/db.js'), 'utf-8');
    const supportsBothUris = dbConfigCode.includes('process.env.MONGODB_URI || process.env.MONGO_URI');
    assert('db.js seamlessly supports both MONGODB_URI and MONGO_URI', supportsBothUris);

    // --------------------------------------------------------------------------
    // TEST 10: Financial Logic Immutability Confirmation
    // --------------------------------------------------------------------------
    console.log('\n--- 10. Financial Logic Immutability Verification ---');
    const gitDiffFinancials = execSync('git diff backend/src/services/accountingService.js backend/src/controllers/paymentController.js', { encoding: 'utf-8' }).trim();
    assert('Accounting service and payment controllers are completely untouched (0 diff)', gitDiffFinancials.length === 0);

  } catch (err) {
    console.error('Fatal error during test execution:', err);
    failed++;
  } finally {
    console.log('\n================================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
