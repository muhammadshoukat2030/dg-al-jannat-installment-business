const mongoose = require('mongoose');

// A Payment record is ONLY created for actual money received (amount > 0).
// A 0-payment / missed installment is recorded separately as a MissedInstallmentEvent.
const paymentSchema = new mongoose.Schema(
  {
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true },
    installmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Installment', required: true },
    // Denormalized from the plan so investor payment history doesn't require a join.
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },

    amount: { type: Number, required: true, min: 0.01 },
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMethod: { type: String, enum: ['Cash', 'Bank Transfer', 'Other'], default: 'Cash' },
    receiptNumber: { type: String, required: true, unique: true },

    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },

    notes: { type: String, default: '' },
    operationId: { type: String, sparse: true, unique: true, index: true },
  },
  { timestamps: true }
);

paymentSchema.index({ customerId: 1, paymentDate: -1 });
paymentSchema.index({ investorId: 1, paymentDate: -1 });
paymentSchema.index({ planId: 1, paymentDate: -1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ createdAt: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
