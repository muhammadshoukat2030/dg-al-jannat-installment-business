const mongoose = require('mongoose');

// Created whenever the admin explicitly records "0" for an installment.
// This is NOT a Payment. It exists so the system can distinguish
// "no payment happened" from "a payment transaction of zero happened".
const missedInstallmentEventSchema = new mongoose.Schema(
  {
    installmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Installment', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true },

    amountDue: { type: Number, required: true },
    paidAmount: { type: Number, default: 0 },
    missedAmount: { type: Number, required: true },

    recordedDate: { type: Date, required: true, default: Date.now },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['MISSED'], default: 'MISSED' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MissedInstallmentEvent', missedInstallmentEventSchema);
