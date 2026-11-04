/**
 * Cryptography Service for Installment Management System 6
 * Provides AES-256-GCM authenticated encryption, SHA-256 integrity hashing,
 * key derivation, Emergency Key Recovery Kit generation, secret token encryption,
 * and backwards-compatible archive versioning (V1 Legacy & V2 Salt-Protected).
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16; // 128 bits

// V2 Archive Header Magic Bytes: 'IMSB' (0x49, 0x4D, 0x53, 0x42) + Version byte 0x02
const V2_MAGIC = Buffer.from([0x49, 0x4d, 0x53, 0x42, 0x02]);

// Legacy fixed salts preserved strictly for backwards-compatible decryption of existing archives
const LEGACY_PASSPHRASE_SALT = Buffer.from('ims_backup_salt_2026_fixed_entropy', 'utf-8');
const LEGACY_MASTER_SALT = Buffer.from('ims_backup_system_master_salt_2026', 'utf-8');

// Token encryption prefix for transparent at-rest encryption
const TOKEN_ENC_PREFIX = 'enc:gcm:v1:';

/**
 * Derives a 256-bit encryption key using a specific cryptographic salt buffer.
 * If BACKUP_ENCRYPTION_KEY is explicitly supplied as a 32-byte or hex string, it is used directly.
 */
function deriveKeyWithSalt(saltBuffer) {
  const envKey = process.env.BACKUP_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      return Buffer.from(envKey, 'hex');
    }
    if (envKey.length === 32) {
      return Buffer.from(envKey, 'utf-8');
    }
    try {
      const b64 = Buffer.from(envKey, 'base64');
      if (b64.length === 32) return b64;
    } catch {}
  }

  const envPass = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (envPass) {
    return crypto.pbkdf2Sync(envPass, saltBuffer, 100000, KEY_LENGTH, 'sha512');
  }

  // Fallback to deterministic derivation from JWT_SECRET + provided salt
  const fallbackSecret = process.env.JWT_SECRET || 'ims_emergency_default_secret_key_2026';
  return crypto.pbkdf2Sync(fallbackSecret, saltBuffer, 100000, KEY_LENGTH, 'sha512');
}

/**
 * Resolves or derives the 256-bit encryption key using legacy fixed salts.
 * Preserves 100% decryption compatibility with all existing V1 .imsbak archives.
 */
function getMasterKey() {
  const envPass = process.env.BACKUP_ENCRYPTION_PASSPHRASE;
  if (envPass) {
    return deriveKeyWithSalt(LEGACY_PASSPHRASE_SALT);
  }
  return deriveKeyWithSalt(LEGACY_MASTER_SALT);
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
 * Computes SHA-256 checksum of a buffer.
 */
function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypts a plain buffer into a Version 2 archive format:
 * [5B V2_MAGIC] + [16B Random Salt] + [12B IV] + [16B Auth Tag] + [Ciphertext]
 * Uses a freshly generated cryptographically secure random salt for every archive.
 */
function encryptArchiveBuffer(plainBuffer, customKey = null) {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = customKey || deriveKeyWithSalt(salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Package: Magic (5B) + Salt (16B) + IV (12B) + AuthTag (16B) + Ciphertext
  const packaged = Buffer.concat([V2_MAGIC, salt, iv, authTag, encrypted]);

  return {
    encryptedBuffer: packaged,
    version: '2.0-salt',
    saltHex: salt.toString('hex'),
    ivHex: iv.toString('hex'),
    authTagHex: authTag.toString('hex'),
    sha256: calculateSha256(packaged),
    keyFingerprint: getKeyFingerprint(key),
  };
}

/**
 * Legacy encryptBuffer (V1 format) for raw buffers without V2 header.
 * Output format: [12 bytes IV] + [16 bytes Auth Tag] + [Ciphertext]
 */
function encryptBuffer(plainBuffer, customKey = null) {
  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(plainBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

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
 * Decrypts a packaged AES-256-GCM buffer.
 * Automatically detects whether the archive is:
 * - Version 2 (starts with V2_MAGIC 5B, extracts 16B dynamic salt, derives key).
 * - Version 1 Legacy (standard [IV 12B] + [AuthTag 16B] + [Ciphertext]).
 * Guarantees 100% backward compatibility with all historical .imsbak backups.
 */
function decryptBuffer(packagedBuffer, customKey = null) {
  if (!packagedBuffer || packagedBuffer.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Encrypted archive is truncated or corrupted (missing cryptographic headers).');
  }

  // Check for Version 2 archive magic header
  const isV2 =
    packagedBuffer.length >= V2_MAGIC.length + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH &&
    packagedBuffer.subarray(0, V2_MAGIC.length).equals(V2_MAGIC);

  let key = customKey;
  let iv;
  let authTag;
  let ciphertext;

  if (isV2) {
    const saltOffset = V2_MAGIC.length;
    const ivOffset = saltOffset + SALT_LENGTH;
    const tagOffset = ivOffset + IV_LENGTH;
    const cipherOffset = tagOffset + AUTH_TAG_LENGTH;

    const salt = packagedBuffer.subarray(saltOffset, ivOffset);
    iv = packagedBuffer.subarray(ivOffset, tagOffset);
    authTag = packagedBuffer.subarray(tagOffset, cipherOffset);
    ciphertext = packagedBuffer.subarray(cipherOffset);

    if (!key) {
      key = deriveKeyWithSalt(salt);
    }
  } else {
    // Legacy Version 1 Archive
    iv = packagedBuffer.subarray(0, IV_LENGTH);
    authTag = packagedBuffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    ciphertext = packagedBuffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    if (!key) {
      key = getMasterKey();
    }
  }

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
 * Encrypts a sensitive string (such as an OAuth access or refresh token) using AES-256-GCM.
 * Formats output as: "enc:gcm:v1:<ivHex>:<authTagHex>:<ciphertextHex>"
 */
function encryptSecretText(plainText, customKey = null) {
  if (!plainText || typeof plainText !== 'string') return plainText;
  if (plainText.startsWith(TOKEN_ENC_PREFIX)) return plainText; // Already encrypted

  const key = customKey || getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  const encrypted = Buffer.concat([cipher.update(Buffer.from(plainText, 'utf-8')), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${TOKEN_ENC_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an encrypted secret string.
 * If the string does NOT start with TOKEN_ENC_PREFIX, returns it unmodified for backwards compatibility.
 */
function decryptSecretText(cipherText, customKey = null) {
  if (!cipherText || typeof cipherText !== 'string') return cipherText;
  if (!cipherText.startsWith(TOKEN_ENC_PREFIX)) return cipherText; // Plaintext legacy token

  const payload = cipherText.slice(TOKEN_ENC_PREFIX.length);
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted secret token format.');
  }

  const [ivHex, authTagHex, encHex] = parts;
  const key = customKey || getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf-8');
  } catch (err) {
    throw new Error('Decryption failed for secret token. The encryption key may have changed or data was corrupted.');
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
  V2_MAGIC,
  getMasterKey,
  deriveKeyWithSalt,
  getKeyFingerprint,
  calculateSha256,
  encryptBuffer,
  encryptArchiveBuffer,
  decryptBuffer,
  encryptSecretText,
  decryptSecretText,
  generateEmergencyRecoveryKit,
};
