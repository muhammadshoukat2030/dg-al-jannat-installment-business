const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getBackupStatus,
  getBackupHistory,
  createManualBackup,
  verifyBackup,
  downloadBackup,
  testRestoreBackup,
  productionRestoreBackup,
  downloadEmergencyRecoveryKit,
  getGoogleOAuthUrl,
  handleGoogleOAuthCallback,
  disconnectGoogleDrive,
  updateBackupSettings,
  triggerCronBackup,
  getGoogleDriveBackups,
  inspectGoogleDriveBackup,
  restoreGoogleDriveBackup,
} = require('../controllers/backupController');

// Public Google OAuth Callback
router.get('/oauth/callback', handleGoogleOAuthCallback);

// Free automated cron triggers (webhook/GET/POST with optional secret)
router.get('/cron', triggerCronBackup);
router.post('/cron', triggerCronBackup);

// Protected Admin Routes
router.use(protect);

router.get('/status', getBackupStatus);
router.get('/history', getBackupHistory);
router.post('/create', createManualBackup);
router.post('/verify/:id', verifyBackup);
router.get('/download/:id', downloadBackup);
router.post('/restore/test/:id', testRestoreBackup);
router.post('/restore/production/:id', productionRestoreBackup);
router.get('/emergency-kit', downloadEmergencyRecoveryKit);
router.get('/oauth/url', getGoogleOAuthUrl);
router.post('/oauth/disconnect', disconnectGoogleDrive);
router.put('/settings', updateBackupSettings);

// Google Drive Automated Recovery Routes
router.get('/gdrive/list', getGoogleDriveBackups);
router.get('/gdrive/inspect/:fileId', inspectGoogleDriveBackup);
router.post('/gdrive/restore/:fileId', restoreGoogleDriveBackup);

module.exports = router;
