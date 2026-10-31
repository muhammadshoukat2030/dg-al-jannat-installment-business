const mongoose = require('mongoose');

// Every investor money movement is recorded here — capital balances are ALWAYS
// derived from these records (sum of INVESTMENT_IN minus RETURN_TO_INVESTOR),
// never stored/overwritten as a standalone editable balance field.
//
// IMPORTANT: RETURN_TO_INVESTOR means the investor's original CAPITAL is being
// handed back (reduces capitalHeld). PROFIT_WITHDRAWAL means the investor is
// withdrawing their share of REALIZED PROFIT (tracked separately in
// accountingService — does NOT reduce capitalHeld). These were previously
// conflated (profit withdrawals were incorrectly recorded as RETURN_TO_INVESTOR,
// which silently shrank investor capital every time profit was withdrawn) — kept
// as two distinct types so capital and profit never mix.
const investorTransactionSchema = new mongoose.Schema(
  {
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
    transactionType: {
      type: String,
      enum: ['INVESTMENT_IN', 'RETURN_TO_INVESTOR', 'PROFIT_WITHDRAWAL', 'PROFIT_TO_CAPITAL', 'ADJUSTMENT'],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    operationId: { type: String, sparse: true, unique: true },
    transactionDate: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

investorTransactionSchema.index({ investorId: 1, transactionType: 1 });
investorTransactionSchema.index({ investorId: 1, transactionDate: -1 });

module.exports = mongoose.model('InvestorTransaction', investorTransactionSchema);
