const mongoose = require('mongoose');

/**
 * Records how a contract's REALIZED profit was split between Owner and Investor(s).
 *
 * Realization rule (Profit-First Cash Allocation Method):
 *   realizedProfit = min(totalExpectedProfit, totalCollected)
 * Profit is recognized immediately from the first rupees collected (down payment and
 * monthly payments) up to totalExpectedProfit. Once the full profit is recognized,
 * subsequent payments represent pure recovered capital.
 *
 * Split rule (50/50 requirement):
 *   ownerProfit = round(realizedProfit * 0.5)
 *   investorPool = realizedProfit - ownerProfit
 *   Each investor's share of investorPool is proportional to their share of the
 *   contract's total INVESTOR-sourced funding.
 *
 * A new ProfitDistribution snapshot is recalculated (not appended) each time collections
 * change for a contract, reflecting current realized collections without double counting.
 */
const investorShareSchema = new mongoose.Schema(
  {
    investorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Investor', required: true },
    fundedAmount: { type: Number, required: true },
    fundedSharePercent: { type: Number, required: true },
    profitShare: { type: Number, required: true },
    recoveredCapital: { type: Number, default: 0 },
    capitalStillDeployed: { type: Number, default: 0 },
  },
  { _id: false }
);

const profitDistributionSchema = new mongoose.Schema(
  {
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'InstallmentPlan', required: true, unique: true },
    totalExpectedProfit: { type: Number, required: true },
    totalCollected: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    realizedProfit: { type: Number, required: true },
    ownerProfit: { type: Number, required: true },
    investorProfitPool: { type: Number, required: true },
    investorShares: { type: [investorShareSchema], default: [] },
    recoveredCapital: { type: Number, default: 0 },
    ownerRecoveredCapital: { type: Number, default: 0 },
    investorRecoveredCapital: { type: Number, default: 0 },
    capitalStillDeployed: { type: Number, default: 0 },
    calculatedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

// Note: the unique index on planId is already declared via `unique: true` on the
// field above — a separate explicit .index({ planId: 1 }, { unique: true }) call
// here previously duplicated it, which Mongoose flags with a
// "Duplicate schema index" warning at startup. Removed; the field-level
// declaration is the single source of truth for this index.

module.exports = mongoose.model('ProfitDistribution', profitDistributionSchema);
