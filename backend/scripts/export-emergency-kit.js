#!/usr/bin/env node
/**
 * Offline Emergency Recovery Kit Generator for Installment Management System 6
 *
 * This command-line utility displays or exports the master encryption key and
 * recovery instructions completely offline from the secure server console.
 * No data is transmitted over the network or exposed via HTTP endpoints.
 *
 * Usage:
 *   node backend/scripts/export-emergency-kit.js
 *   node backend/scripts/export-emergency-kit.js --output /path/to/safe_location.txt
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();

const cryptoService = require('../src/services/cryptoService');

function main() {
  console.log('================================================================================');
  console.log('INSTALLMENT MANAGEMENT SYSTEM — SECURE EMERGENCY RECOVERY TOOL (OFFLINE CLI)');
  console.log('================================================================================\n');

  try {
    const kit = cryptoService.generateEmergencyRecoveryKit();
    const textContent = `
================================================================================
${kit.title}
================================================================================
Generated: ${kit.generatedAt}
Algorithm: ${kit.algorithm}
Key Fingerprint: ${kit.keyFingerprint}

MASTER ENCRYPTION KEY (HEX):
--------------------------------------------------------------------------------
${kit.masterKeyHex}
--------------------------------------------------------------------------------

CRITICAL INSTRUCTIONS:
${kit.instructions.join('\n')}

================================================================================
KEEP THIS KIT SAFE AND CONFIDENTIAL. NEVER COMMIT THIS FILE TO GIT.
================================================================================
`.trim();

    const args = process.argv.slice(2);
    const outputIdx = args.indexOf('--output');

    if (outputIdx !== -1 && args[outputIdx + 1]) {
      const targetPath = path.resolve(args[outputIdx + 1]);
      fs.writeFileSync(targetPath, textContent, { encoding: 'utf-8', mode: 0o600 });
      console.log(`[SUCCESS] Emergency kit written securely to: ${targetPath}`);
    } else {
      console.log(textContent);
      console.log('\n[TIP] You can also write this to an offline safe location using:');
      console.log('      node backend/scripts/export-emergency-kit.js --output C:\\Safe\\recovery.txt');
    }
  } catch (err) {
    console.error('[ERROR] Failed to generate emergency kit:', err.message);
    process.exit(1);
  }
}

main();
