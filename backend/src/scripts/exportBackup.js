/**
 * Non-destructive Server-Side Database Backup Utility
 * Exports complete JSON snapshots of all MongoDB collections to a local backups/ folder.
 * Does not delete, modify, or lock collections.
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Models
const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');
const InvestorTransaction = require('../models/InvestorTransaction');
const Withdrawal = require('../models/Withdrawal');
const OwnerTransaction = require('../models/OwnerTransaction');
const BusinessSetting = require('../models/BusinessSetting');
const Admin = require('../models/Admin');
const MissedInstallmentEvent = require('../models/MissedInstallmentEvent');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/installment_management3';

async function performBackup() {
  console.log('Connecting to database for non-destructive backup...');
  await mongoose.connect(MONGO_URI);

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(__dirname, '../../backups');

    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `backup_${timestamp}.json`);

    console.log('Fetching collections snapshot...');
    const [
      customers,
      plans,
      installments,
      payments,
      investors,
      investorTransactions,
      withdrawals,
      ownerTransactions,
      settings,
      admins,
      missedEvents,
    ] = await Promise.all([
      Customer.find({}).lean(),
      InstallmentPlan.find({}).lean(),
      Installment.find({}).lean(),
      Payment.find({}).lean(),
      Investor.find({}).lean(),
      InvestorTransaction.find({}).lean(),
      Withdrawal.find({}).lean(),
      OwnerTransaction.find({}).lean(),
      BusinessSetting.find({}).lean(),
      Admin.find({}).lean(),
      MissedInstallmentEvent.find({}).lean(),
    ]);

    const backupPayload = {
      version: '1.0',
      timestamp: new Date().toISOString(),
      database: mongoose.connection.name,
      counts: {
        customers: customers.length,
        plans: plans.length,
        installments: installments.length,
        payments: payments.length,
        investors: investors.length,
        investorTransactions: investorTransactions.length,
        withdrawals: withdrawals.length,
        ownerTransactions: ownerTransactions.length,
        settings: settings.length,
        admins: admins.length,
        missedEvents: missedEvents.length,
      },
      data: {
        customers,
        plans,
        installments,
        payments,
        investors,
        investorTransactions,
        withdrawals,
        ownerTransactions,
        settings,
        admins,
        missedEvents,
      },
    };

    fs.writeFileSync(backupFile, JSON.stringify(backupPayload, null, 2), 'utf-8');
    console.log(`✓ Backup successfully created at: ${backupFile}`);
    console.log('Counts:', backupPayload.counts);
    return backupFile;
  } finally {
    await mongoose.disconnect();
  }
}

if (require.main === module) {
  performBackup()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Backup failed:', err);
      process.exit(1);
    });
}

module.exports = { performBackup };
