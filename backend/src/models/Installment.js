const mongoose = require('mongoose');

const installmentSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    // Denormalized from the plan at creation time so investor-scoped installment/payment
    // queries don't need to join through InstallmentPlan for every row.
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },

    installmentNumber: { type: Number, required: true },
    monthLabel: { type: String, required: true }, // e.g. "June 2026"
    dueDate: { type: Date, required: true },

    amountDue: { type: Number, required: true, min: 0 }, // SCHEDULED amount — never silently changed for historical rows
    paidAmount: { type: Number, default: 0, min: 0 },     // ACTUAL amount collected so far for this installment
    remainingAmount: { type: Number, required: true },    // amountDue - paidAmount, floor 0

    status: {
      type: String,
      enum: ['PENDING', 'PAID', 'PARTIAL', 'MISSED', 'OVERDUE'],
      default: 'PENDING',
    },

    // Explicit flag: true once admin has explicitly recorded a 0/missed event for this installment.
    // Prevents the OVERDUE auto-status job from silently overwriting an admin decision.
    explicitlyMissed: { type: Boolean, default: false },

    paymentDate: { type: Date, default: null },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

installmentSchema.index({ planId: 1, installmentNumber: 1 }, { unique: true });
installmentSchema.index({ customerId: 1 });
installmentSchema.index({ investorId: 1 });
installmentSchema.index({ status: 1, dueDate: 1 });
installmentSchema.index({ dueDate: 1 });
installmentSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('Installment', installmentSchema);
