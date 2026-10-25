require('dotenv').config();
const app = require('./app');
const connectDB = require('./config/db');
const { migrateHistoricalWithdrawals } = require('./utils/migration');

const PORT = process.env.PORT || 5000;

async function start() {
  try {
    await connectDB();
    await migrateHistoricalWithdrawals();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app;
