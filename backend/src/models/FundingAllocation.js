const mongoose = require('mongoose');

// Records EXACTLY who funded how much of a given contract. A contract can have
// multiple allocation rows (Owner + one or more Investors). This is additive to
// the existing InstallmentPlan.fundingSource/investorId/capitalDeployed fields —
// for a simple single-investor-or-business contract, those existing fields remain
// the source of truth and no FundingAllocation rows are required. FundingAllocation
// is used when a contract needs a genuine multi-source split (Owner + Investor A +
// Investor B, etc.) that the simple single-investor fields can't represent.
const fundingAllocationSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true },
    sourceType: { type: String, enum: ['OWNER', 'INVESTOR'], required: true },
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null }, // required when sourceType === 'INVESTOR'
    amount: { type: Number, required: true, min: 0.01 },
  },
  { timestamps: true }
);

fundingAllocationSchema.pre('validate', function enforceInvestorRule(next) {
  if (this.sourceType === 'INVESTOR' && !this.investorId) {
    return next(new Error('investorId is required when sourceType is INVESTOR.'));
  }
  if (this.sourceType === 'OWNER') this.investorId = null;
  next();
});

fundingAllocationSchema.index({ planId: 1 });
fundingAllocationSchema.index({ investorId: 1 });
fundingAllocationSchema.index({ createdAt: -1 });
fundingAllocationSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('FundingAllocation', fundingAllocationSchema);
