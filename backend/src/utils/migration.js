const mongoose = require('mongoose');
const Withdrawal = require('../models/Withdrawal');
const InvestorTransaction = require('../models/InvestorTransaction');
const OwnerTransaction = require('../models/OwnerTransaction');

/**
 * Safe, idempotent migration to preserve historical profit withdrawals as reinvestments.
 *
 * CRITICAL BUSINESS RULE:
 * Existing historical profit withdrawals were previously treated as reinvestments into capital.
 * To preserve their historical meaning and balances:
 * - Update existing Withdrawal records to withdrawalType: 'PROFIT_TO_CAPITAL'
 * - Update corresponding InvestorTransaction records to transactionType: 'PROFIT_TO_CAPITAL'
 * - Update corresponding OwnerTransaction records to transactionType: 'OWNER_PROFIT_TO_CAPITAL'
 *
 * This ensures no historical reinvested capital is lost, and new cash withdrawals
 * remain strictly separate without double-counting.
 */
async function migrateHistoricalWithdrawals() {
  try {
    // 1. Find all legacy withdrawals that don't have withdrawalType explicitly set to PROFIT_CASH
    // or were created before the new transaction separation feature.
    const legacyWithdrawals = await Withdrawal.find({
      $or: [
        { withdrawalType: { $exists: false } },
        { withdrawalType: null },
      ],
    });

    if (legacyWithdrawals.length > 0) {
      const withdrawalIds = legacyWithdrawals.map((w) => w._id);

      // Mark legacy withdrawals as PROFIT_TO_CAPITAL so they are recognized as reinvestments
      await Withdrawal.updateMany(
        { _id: { $in: withdrawalIds } },
        { $set: { withdrawalType: 'PROFIT_TO_CAPITAL' } }
      );

      // Update corresponding InvestorTransaction records
      for (const w of legacyWithdrawals) {
        await InvestorTransaction.updateMany(
          {
            investorId: w.investorId,
            transactionType: 'PROFIT_WITHDRAWAL',
            notes: { $regex: String(w._id) },
          },
          { $set: { transactionType: 'PROFIT_TO_CAPITAL' } }
        );

        // Update corresponding OwnerTransaction records
        await OwnerTransaction.updateMany(
          {
            withdrawalId: w._id,
            transactionType: 'OWNER_WITHDRAWAL',
          },
          { $set: { transactionType: 'OWNER_PROFIT_TO_CAPITAL' } }
        );
      }

      console.log(`[Migration] Migrated ${legacyWithdrawals.length} historical withdrawal records to PROFIT_TO_CAPITAL reinvestments.`);
    }

    // Also migrate any InvestorTransaction / OwnerTransaction that reference a Withdrawal that is marked PROFIT_TO_CAPITAL
    const reinvestmentWithdrawals = await Withdrawal.find({ withdrawalType: 'PROFIT_TO_CAPITAL' });
    for (const w of reinvestmentWithdrawals) {
      await InvestorTransaction.updateMany(
        {
          investorId: w.investorId,
          transactionType: 'PROFIT_WITHDRAWAL',
          notes: { $regex: String(w._id) },
        },
        { $set: { transactionType: 'PROFIT_TO_CAPITAL' } }
      );

      await OwnerTransaction.updateMany(
        {
          withdrawalId: w._id,
          transactionType: 'OWNER_WITHDRAWAL',
        },
        { $set: { transactionType: 'OWNER_PROFIT_TO_CAPITAL' } }
      );
    }
  } catch (err) {
    console.error('[Migration Error]', err.message);
  }
}

module.exports = { migrateHistoricalWithdrawals };
