const mongoose = require('mongoose');

/**
 * A withdrawal of INVESTOR-generated profit. Per the required business rule, every
 * such withdrawal is always split exactly 50/50 between Owner and Investor — never
 * an arbitrary split. ownerAmount and investorAmount are always totalAmount / 2 each
 * (enforced server-side in accountingService, never trusted from the client).
 */
const withdrawalSchema = new mongoose.Schema(
  {
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
    totalAmount: { type: Number, required: true, min: 0.01 },
    ownerAmount: { type: Number, required: true },
    investorAmount: { type: Number, required: true },
    withdrawalDate: { type: Date, required: true, default: Date.now },
    reference: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    operationId: { type: String, sparse: true, unique: true },
    status: { type: String, enum: ['COMPLETED'], default: 'COMPLETED' },
    // withdrawalType distinguishes cash-out (PROFIT_CASH, the default for all historical records)
    // from profit-to-capital transfers (PROFIT_TO_CAPITAL). Old records without this field default
    // to PROFIT_CASH and are treated as cash exits — they do NOT reinvest into capital.
    withdrawalType: { type: String, enum: ['PROFIT_CASH', 'PROFIT_TO_CAPITAL'], default: 'PROFIT_CASH' },
  },
  { timestamps: true }
);

withdrawalSchema.index({ investorId: 1, withdrawalDate: -1 });
withdrawalSchema.index({ withdrawalDate: -1 });
withdrawalSchema.index({ createdAt: -1 });
withdrawalSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
