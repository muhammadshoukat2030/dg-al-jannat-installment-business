/**
 * Cryptography Service for Installment Management System 6
 * Provides AES-256-GCM authenticated encryption, SHA-256 integrity hashing,
 * key derivation, and Emergency Key Recovery Kit generation.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;

/**
 * Resolves or derives the 256-bit encryption key.
 * 1. Checks process.env.BACKUP_ENCRYPTION_KEY (hex or raw 32-byte).
 * 2. Checks process.env.BACKUP_ENCRYPTION_PASSPHRASE (PBKDF2 derived).
 * 3. Falls back to a persistent local keyfile or JWT_SECRET-derived key.
 */
function getMasterKey() {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    }
    if (envKey.length === 32) {
      return Buffer.from(envKey, 'utf-8');
    }
    // Base64 check
    try {
      const b64 = Buffer.from(envKey, 'base64');
      if (b64.length === 32) return b64;
    } catch {}
  }

  const envPass = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (envPass) {
    const salt = Buffer.from('ims_backup_salt_2026_fixed_entropy', 'utf-8');
    return crypto.pbkdf2Sync(envPass, salt, 100000, KEY_LENGTH, 'sha512');
  }

  // Fallback to deterministic derivation from JWT_SECRET + fixed salt
  const fallbackSecret = process.env.JWT_SECRET || 'ims_emergency_default_secret_key_2026';
  const salt = Buffer.from('ims_backup_system_master_salt_2026', 'utf-8');
  return crypto.pbkdf2Sync(fallbackSecret, salt, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Returns a safe fingerprint (first 8 hex characters of key's SHA-256)
 * to verify key identity without revealing secret key material.
 */
function getKeyFingerprint(keyBuffer = null) {
  const key = keyBuffer || getMasterKey();
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `key_${hash.slice(0, 8)}`;
}

/**
 * Computes SHA-256 checksum of a buffer or stream.
 */
function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypts a plain buffer using AES-256-GCM.
 * Output format: [12 bytes IV] + [16 bytes Auth Tag] + [Ciphertext]
 */
function encryptBuffer(plainBuffer, customKey = null) {
  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Prepend IV and AuthTag to ciphertext for atomic portability
  const packaged = Buffer.concat([iv, authTag, encrypted]);

  return {
    encryptedBuffer: packaged,
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    sha256: calculateSha256(packaged),
    keyFingerprint: getKeyFingerprint(key),
  };
}

/**
 * Decrypts a packaged AES-256-GCM buffer ([IV 12B] + [AuthTag 16B] + [Ciphertext]).
 */
function decryptBuffer(packagedBuffer, customKey = null) {
  if (packagedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted archive is truncated or corrupted (missing cryptographic headers).');
  }

  const key = customKey || getMasterKey();
  const iv = packagedBuffer.subarray(0, IV_LENGTH);
  const authTag = packagedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packagedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted;
  } catch (err) {
    throw new Error(
      'Decryption failed: Cryptographic authentication tag verification failed. ' +
        'The archive has been altered, corrupted, or an incorrect encryption key was provided.'
    );
  }
}

/**
 * Generates an Emergency Backup Recovery Kit for the administrator.
 */
function generateEmergencyRecoveryKit() {
  const key = getMasterKey();
  const hexKey = key.toString('hex');
  const fingerprint = getKeyFingerprint(key);

  return {
    title: 'INSTALLMENT SYSTEM — EMERGENCY DATABASE BACKUP RECOVERY KIT',
    generatedAt: new Date().toISOString(),
    algorithm: 'AES-256-GCM (Authenticated Encryption)',
    keyFingerprint: fingerprint,
    masterKeyHex: hexKey,
    instructions: [
      '1. KEEP THIS DOCUMENT IN A SECURE LOCATION (e.g. Password Manager or Physical Safe).',
      '2. If your server is destroyed or MongoDB database is accidentally deleted, you will need this key to decrypt your backups.',
      '3. To configure a new server or recovery environment, set the following environment variable:',
      `   BACKUP_ENCRYPTION_KEY=${hexKey}`,
      '4. Backups are cryptographically signed with AES-256-GCM. Modifying any byte will cause authentication tag failure.',
      '5. You can also decrypt your backup using the included Node.js offline recovery script.',
    ],
  };
}

module.exports = {
  ALGORITHM,
  getMasterKey,
  getKeyFingerprint,
  calculateSha256,
  encryptBuffer,
  decryptBuffer,
  generateEmergencyRecoveryKit,
};
