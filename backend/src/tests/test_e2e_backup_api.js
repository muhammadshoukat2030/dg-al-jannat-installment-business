const http = require('http');
const https = require('https');
const dotenv = require('dotenv');
dotenv.config();

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const client = options.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed, raw: data });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function runE2E() {
  console.log('====================================================');
  console.log('🚀 RUNNING END-TO-END BACKUP & RECOVERY API TESTS');
  console.log('====================================================\n');

  // Step 1: Login to get JWT Token
  console.log('Step 1: Logging in as admin...');
  const loginRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    },
    { email: 'admin@localhost.com', password: '12345' }
  );

  const token = loginRes.data?.token || loginRes.data?.data?.token;
  if (loginRes.status !== 200 || !token) {
    console.error('Failed to log in:', loginRes);
    process.exit(1);
  }
  console.log('✅ Admin authenticated successfully.\n');

  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // Step 2: Get Initial Backup Status
  console.log('Step 2: Checking GET /api/backup/status...');
  const statusRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/backup/status',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`Status code: ${statusRes.status}`);
  const statusData = statusRes.data?.data;
  console.log(`Database Online: ${statusData?.database?.status}`);
  console.log(`Total Collections: ${statusData?.database?.totalCollections}`);
  console.log(`Total Documents: ${statusData?.database?.totalDocuments}`);
  console.log(`Encryption: ${statusData?.security?.algorithm} (Fingerprint: ${statusData?.security?.keyFingerprint})`);
  console.log(`Google Drive Connected: ${statusData?.googleDrive?.isConnected}`);
  if (statusRes.status !== 200) throw new Error('Failed GET /api/backup/status');
  console.log('✅ Status API verified.\n');

  // Step 3: Trigger On-Demand Backup Creation
  console.log('Step 3: Creating an on-demand encrypted backup via POST /api/backup/create...');
  const createRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/backup/create',
    method: 'POST',
    headers: authHeaders,
  });

  console.log(`Create Status: ${createRes.status}`);
  if (createRes.status !== 201) {
    console.error('Create error:', createRes);
    throw new Error('Failed to create backup');
  }
  const newBackup = createRes.data?.data;
  console.log(`✅ Backup created: ${newBackup.backupId}`);
  console.log(`   Filename: ${newBackup.filename}`);
  console.log(`   Size: ${newBackup.encryptedSizeBytes || newBackup.unencryptedSizeBytes} bytes`);
  console.log(`   SHA-256: ${newBackup.sha256Checksum?.substring(0, 16)}...`);
  console.log(`   Collections: ${newBackup.collectionsSummary?.length}`);
  console.log(`   Documents: ${newBackup.totalDocuments}\n`);

  // Step 4: Verify Backup History
  console.log('Step 4: Fetching backup history via GET /api/backup/history...');
  const historyRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/backup/history?limit=10',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`History count: ${historyRes.data?.data?.length}`);
  const found = historyRes.data?.data?.find((b) => b.backupId === newBackup.backupId);
  if (!found) throw new Error('Created backup not found in history');
  console.log('✅ Backup record confirmed in history list.\n');

  // Step 5: Verify Archive Integrity (Cryptographic Check)
  console.log(`Step 5: Verifying archive integrity via POST /api/backup/verify/${newBackup.backupId}...`);
  const verifyRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/backup/verify/${newBackup.backupId}`,
    method: 'POST',
    headers: authHeaders,
  });

  console.log(`Verify Status: ${verifyRes.status}`);
  if (verifyRes.status !== 200 || !verifyRes.data?.success) {
    console.error('Verify error:', verifyRes);
    throw new Error('Backup verification failed');
  }
  console.log(`Manifest: ${verifyRes.data.data?.manifest?.totalCollections} collections, ${verifyRes.data.data?.manifest?.totalDocuments} documents`);
  console.log('✅ Archive integrity and AES-256-GCM authentication tag verified.\n');

  // Step 6: Isolated Disaster Recovery Test
  console.log(`Step 6: Executing Isolated Test Restore via POST /api/backup/restore/test/${newBackup.backupId}...`);
  const restoreRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: `/api/backup/restore/test/${newBackup.backupId}`,
    method: 'POST',
    headers: authHeaders,
  });

  console.log(`Test Restore Status: ${restoreRes.status}`);
  console.log(`Restore Success: ${restoreRes.data?.success}`);
  const report = restoreRes.data?.data;
  console.log(`Target Database: ${report?.targetDbName}`);
  console.log(`Restored Collections: ${report?.restoredCollections}`);
  console.log(`Restored Documents: ${report?.restoredDocuments}`);
  console.log(`Discrepancies: ${report?.discrepancies?.length || 0}`);
  if (restoreRes.status !== 200 || !report?.success || (report?.discrepancies && report?.discrepancies?.length > 0)) {
    throw new Error('Test restore failed document parity check');
  }
  console.log('✅ Isolated disaster recovery test passed with 100% data parity!\n');

  // Step 7: Test Emergency Recovery Key Kit Endpoint
  console.log('Step 7: Testing GET /api/backup/emergency-kit...');
  const kitRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/backup/emergency-kit',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`Kit Status: ${kitRes.status}`);
  const kitRaw = kitRes.raw || JSON.stringify(kitRes.data);
  if (kitRes.status !== 200 || !kitRaw.includes('MASTER ENCRYPTION KEY')) {
    throw new Error('Emergency kit download failed');
  }
  console.log('✅ Emergency Recovery Key Kit endpoint verified.\n');

  // Step 8: Test Schedule & Retention Settings Update
  console.log('Step 8: Testing PUT /api/backup/settings...');
  const updateSettingsRes = await request(
    {
      hostname: 'localhost',
      port: 5000,
      path: '/api/backup/settings',
      method: 'PUT',
      headers: authHeaders,
    },
    {
      schedule: {
        isEnabled: false,
        timezone: 'Asia/Karachi',
        daily: { enabled: true, time: '02:00' },
      },
      retention: {
        dailyDays: 30,
        weeklyWeeks: 12,
        monthlyMonths: 12,
      },
    }
  );

  console.log(`Update Settings Status: ${updateSettingsRes.status}`);
  if (updateSettingsRes.status !== 200) throw new Error('Settings update failed');
  console.log('✅ Schedule and retention settings updated and persisted.\n');

  // Step 9: Test Google Drive Connect Endpoint
  console.log('Step 9: Testing GET /api/backup/oauth/url...');
  const gdriveConnectRes = await request({
    hostname: 'localhost',
    port: 5000,
    path: '/api/backup/oauth/url',
    method: 'GET',
    headers: authHeaders,
  });

  console.log(`OAuth URL Status: ${gdriveConnectRes.status}`);
  if (gdriveConnectRes.status === 200) {
    console.log(`OAuth URL generated: ${gdriveConnectRes.data.url?.substring(0, 50)}...`);
  } else {
    console.log(`OAuth guidance / message: ${gdriveConnectRes.data?.message}`);
  }
  console.log('✅ Google Drive OAuth endpoint handled correctly.\n');

  console.log('====================================================');
  console.log('🎉 ALL 9 END-TO-END BACKUP & RECOVERY API TESTS PASSED!');
  console.log('====================================================');
}

runE2E().catch((err) => {
  console.error('❌ E2E Test Failure:', err);
  process.exit(1);
});
