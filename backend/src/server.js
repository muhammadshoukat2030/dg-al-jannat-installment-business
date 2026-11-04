const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { migrateHistoricalWithdrawals } = require('./utils/migration');
const { initializeScheduler } = require('./services/backupSchedulerService');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await migrateHistoricalWithdrawals();
    await initializeScheduler().catch((e) => console.warn('[BackupScheduler] Init warning:', e.message));
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

if (!process.env.VERCEL) {
  start();
}

module.exports = app;
