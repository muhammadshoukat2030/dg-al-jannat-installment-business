const mongoose = require('mongoose');

const installmentPlanSchema = new mongoose.Schema(
  {
    contractId: { type: String, required: true, unique: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
    productName: { type: String, required: true, trim: true },
    productDescription: { type: String, trim: true, default: '' },

    purchaseCost: { type: Number, required: true, min: 0 },
    sellingPrice: { type: Number, required: true, min: 0 },
    downPayment: { type: Number, required: true, min: 0, default: 0 },

    // remainingAmount = sellingPrice - downPayment - sum(actual payments)
    remainingAmount: { type: Number, required: true, min: 0 },

    monthlyInstallment: { type: Number, required: true, min: 0 },
    installmentDurationMonths: { type: Number, required: true, min: 1 },

    startDate: { type: Date, required: true },
    firstDueDate: { type: Date, required: true },

    // Funding source: either the business's own money, or a specific investor's
    // capital. When fundingSource is INVESTOR, investorId is required.
    fundingSource: { type: String, enum: ['BUSINESS', 'INVESTOR'], default: 'BUSINESS' },
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', default: null },
    // The portion of investor capital allocated to this specific contract.
    // Defaults to purchaseCost when funded by an investor (the capital deployed
    // to acquire the product) unless the admin overrides it.
    capitalDeployed: { type: Number, default: 0, min: 0 },

    // Derived / cached financial figures (always recalculated server-side)
    expectedProfit: { type: Number, default: 0 },
    expectedLoss: { type: Number, default: 0 },
    profitMargin: { type: Number, default: 0 },
    totalPaid: { type: Number, default: 0 },

    status: { type: String, enum: ['ACTIVE', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    notes: { type: String, default: '' },
  },
  { timestamps: true }
);

installmentPlanSchema.index({ investorId: 1 });
installmentPlanSchema.index({ customerId: 1, status: 1 });
installmentPlanSchema.index({ customerId: 1, investorId: 1 });
installmentPlanSchema.index({ startDate: -1 });
installmentPlanSchema.index({ isDeleted: 1, createdAt: -1 });
installmentPlanSchema.index({ updatedAt: 1 });

installmentPlanSchema.pre('validate', function enforceInvestorRule(next) {
  if (this.fundingSource === 'INVESTOR' && !this.investorId) {
    return next(new Error('An investor must be selected when funding source is INVESTOR.'));
  }
  if (this.fundingSource === 'BUSINESS') {
    this.investorId = null;
    this.capitalDeployed = 0;
  }
  next();
});

installmentPlanSchema.methods.recalculateProfit = function recalculateProfit() {
  const diff = this.sellingPrice - this.purchaseCost;
  if (diff > 0) {
    this.expectedProfit = diff;
    this.expectedLoss = 0;
  } else if (diff < 0) {
    this.expectedProfit = 0;
    this.expectedLoss = Math.abs(diff);
  } else {
    this.expectedProfit = 0;
    this.expectedLoss = 0;
  }
  this.profitMargin = this.sellingPrice > 0 ? (this.expectedProfit / this.sellingPrice) * 100 : 0;
};

module.exports = mongoose.model('InstallmentPlan', installmentPlanSchema);
