const mongoose = require('mongoose');

// Every Owner-side money movement — capital contributed, capital deployed, profit
// share received from an investor-funded contract, or profit withdrawn. Owner
// balances are always derived from these records, never hand-edited, exactly
// like InvestorTransaction.
const ownerTransactionSchema = new mongoose.Schema(
  {
    transactionType: {
      type: String,
      enum: [
        'CAPITAL_IN', // owner contributes own capital to the business
        'CAPITAL_RETURNED',
        'CAPITAL_DEPLOYED', // owner's own capital used to fund a contract
        'OWNER_PROFIT_SHARE', // owner's 50% share of a profit distribution
        'OWNER_WITHDRAWAL',    // owner cash profit withdrawal (does NOT increase capital)
        'OWNER_PROFIT_TO_CAPITAL', // owner transfers profit to capital (internal, increases available capital)
        'ADJUSTMENT',
      ],
      required: true,
    },
    amount: { type: Number, required: true, min: 0.01 },
    transactionDate: { type: Date, required: true, default: Date.now },
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null }, // set for OWNER_PROFIT_SHARE — which investor's contract generated it
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', default: null },
    withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal', default: null },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true }
);

ownerTransactionSchema.index({ transactionType: 1, transactionDate: -1 });
ownerTransactionSchema.index({ investorId: 1 });
ownerTransactionSchema.index({ transactionDate: -1, createdAt: -1 });
ownerTransactionSchema.index({ createdAt: 1 });

module.exports = mongoose.model('OwnerTransaction', ownerTransactionSchema);
