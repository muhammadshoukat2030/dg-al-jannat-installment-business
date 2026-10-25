const Investor = require('../models/Investor');
const InstallmentPlan = require('../models/InstallmentPlan');
const Customer = require('../models/Customer');
const Installment = require('../models/Installment');
const ProfitDistribution = require('../models/ProfitDistribution');
const asyncHandler = require('../middleware/asyncHandler');
const { generateContractId } = require('../utils/idGenerator');
const investorService = require('../services/investorService');
const accountingService = require('../services/accountingService');
const {
  createScheduleForPlan,
  changeDuration,
  changeMonthlyInstallment,
  recalcPlanTotals,
} = require('../services/installmentService');

const listPlans = asyncHandler(async (req, res) => {
  const { customerId, status, investorId, preset, from, to } = req.query;
  const query = {};
  if (customerId) query.customerId = customerId;
  if (status) query.status = status;
  if (investorId) query.investorId = investorId;

  const dateRange = require('../utils/dateFilter').parseDateFilter({ preset, from, to });
  if (dateRange) query.startDate = dateRange;

  const plans = await InstallmentPlan.find(query).populate('customerId', 'name contactNumber').sort({ createdAt: -1 });
  res.json({ success: true, data: plans });
});

const getPlan = asyncHandler(async (req, res) => {
  const plan = await InstallmentPlan.findById(req.params.id).populate('customerId').populate('investorId', 'name investorId');
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });

  const schedule = await Installment.find({ planId: plan._id }).sort({ installmentNumber: 1 });
  const profitDistribution = await ProfitDistribution.findOne({ planId: plan._id }).populate('investorShares.investorId', 'name investorId');
  res.json({ success: true, data: { plan, schedule, profitDistribution } });
});

const createPlan = asyncHandler(async (req, res) => {
  const {
    customerId,
    productName,
    productDescription,
    purchaseCost,
    sellingPrice,
    downPayment = 0,
    monthlyInstallment,
    installmentDurationMonths,
    startDate,
    firstDueDate,
    notes,
    fundingSource = 'BUSINESS',
    investorId = null,
    capitalDeployed,
    // When true the caller is the new multi-source flow: it will immediately call
    // fundingController.allocateFunding after this endpoint returns, which performs
    // full server-side validation of every source's real available balance and the
    // total-equals-purchaseCost rule. Skipping the old single-investor check here
    // prevents a false rejection on a BUSINESS-placeholder contract.
    skipFundingValidation = false,
  } = req.body;

  if (!customerId || !productName || purchaseCost == null || sellingPrice == null || !monthlyInstallment || !installmentDurationMonths || !startDate || !firstDueDate) {
    return res.status(400).json({ success: false, message: 'Missing required contract fields.' });
  }

  const customer = await Customer.findById(customerId);
  if (!customer) return res.status(404).json({ success: false, message: 'Customer not found.' });

  if (!skipFundingValidation && fundingSource === 'INVESTOR') {
    if (!investorId) return res.status(400).json({ success: false, message: 'An investor must be selected when funding source is INVESTOR.' });
    const investor = await Investor.findById(investorId);
    if (!investor || investor.isDeleted) return res.status(404).json({ success: false, message: 'Investor not found.' });
    if (investor.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, message: `${investor.name} is not active and cannot be assigned new deployments.` });
    }

    // Server-side is the ONLY source of truth for this check — never trust a
    // frontend-computed "available capital" figure. Deployment can never exceed
    // what's actually available right now (capital held minus already-deployed).
    const deployAmount = capitalDeployed != null ? Number(capitalDeployed) : Number(purchaseCost);
    if (!(deployAmount > 0)) {
      return res.status(400).json({ success: false, message: 'Capital deployed must be greater than 0 for an investor-funded contract.' });
    }
    const capital = await investorService.getInvestorCapitalSummary(investor._id);
    if (deployAmount - capital.capitalAvailable > 0.009) {
      return res.status(400).json({
        success: false,
        message: `Capital to deploy (${deployAmount}) exceeds ${investor.name}'s available capital (${capital.capitalAvailable}).`,
      });
    }
  }

  const remainingAmount = Math.round((sellingPrice - downPayment) * 100) / 100;
  if (remainingAmount < 0) {
    return res.status(400).json({ success: false, message: 'Down payment cannot exceed selling price.' });
  }

  const contractId = await generateContractId();
  const plan = new InstallmentPlan({
    contractId,
    customerId,
    productName,
    productDescription,
    purchaseCost,
    sellingPrice,
    downPayment,
    remainingAmount,
    monthlyInstallment,
    installmentDurationMonths,
    startDate,
    firstDueDate,
    notes,
    fundingSource,
    investorId: fundingSource === 'INVESTOR' ? investorId : null,
    // Deployed capital defaults to the purchase/cost price (the actual capital used
    // to acquire the product) unless the admin explicitly overrides it.
    capitalDeployed: fundingSource === 'INVESTOR' ? (capitalDeployed != null ? Number(capitalDeployed) : purchaseCost) : 0,
  });
  plan.recalculateProfit();
  await plan.save();

  await createScheduleForPlan(plan);
  const updatedPlan = await recalcPlanTotals(plan._id);
  await accountingService.calculateProfitDistribution(plan._id);
  const schedule = await Installment.find({ planId: plan._id }).sort({ installmentNumber: 1 });
  const profitDistribution = await ProfitDistribution.findOne({ planId: plan._id }).populate('investorShares.investorId', 'name investorId');

  res.status(201).json({ success: true, data: { plan: updatedPlan, schedule, profitDistribution } });
});

const updatePlan = asyncHandler(async (req, res) => {
  const plan = await InstallmentPlan.findById(req.params.id);
  if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });

  const editableFields = ['productName', 'productDescription', 'purchaseCost', 'notes', 'status'];
  editableFields.forEach((field) => {
    if (req.body[field] !== undefined) plan[field] = req.body[field];
  });
  plan.recalculateProfit();
  await plan.save();
  res.json({ success: true, data: plan });
});

const updateDuration = asyncHandler(async (req, res) => {
  const { newDurationMonths, confirm } = req.body;
  if (!newDurationMonths) {
    return res.status(400).json({ success: false, message: 'newDurationMonths is required.' });
  }
  if (!confirm) {
    return res.status(400).json({
      success: false,
      message:
        'You are changing the installment duration. Existing payment history will remain unchanged. Future unpaid installments will be recalculated. Resend with confirm: true to proceed.',
    });
  }

  const result = await changeDuration({ planId: req.params.id, newDurationMonths });
  res.json({ success: true, data: result });
});

const updateMonthlyInstallment = asyncHandler(async (req, res) => {
  const { newMonthlyInstallment, confirm } = req.body;
  if (!newMonthlyInstallment || newMonthlyInstallment <= 0) {
    return res.status(400).json({ success: false, message: 'newMonthlyInstallment must be greater than 0.' });
  }
  if (!confirm) {
    return res.status(400).json({
      success: false,
      message: 'This will change future installment amounts. Resend with confirm: true to proceed.',
    });
  }

  const result = await changeMonthlyInstallment({ planId: req.params.id, newMonthlyInstallment });
  res.json({ success: true, data: result });
});

module.exports = { listPlans, getPlan, createPlan, updatePlan, updateDuration, updateMonthlyInstallment };
