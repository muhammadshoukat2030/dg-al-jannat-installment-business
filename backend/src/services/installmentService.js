const Installment = require('../models/Installment');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const MissedInstallmentEvent = require('../models/MissedInstallmentEvent');
const { addMonths, monthLabel, startOfDay } = require('../utils/dateHelpers');
const { generateReceiptNumber } = require('../utils/idGenerator');

/**
 * Generate a full installment schedule for a NEW plan.
 * Distributes the remaining amount across `durationMonths` using the given
 * monthly installment, and folds any rounding remainder into the last
 * installment so the schedule always sums exactly to remainingAmount.
 */
function buildSchedule({ remainingAmount, monthlyInstallment, durationMonths, firstDueDate }) {
  const rows = [];
  let allocated = 0;
  for (let i = 1; i <= durationMonths; i += 1) {
    const dueDate = addMonths(firstDueDate, i - 1);
    let amountDue = monthlyInstallment;
    if (i === durationMonths) {
      // last installment absorbs rounding difference so the total matches exactly
      amountDue = Math.round((remainingAmount - allocated) * 100) / 100;
      if (amountDue < 0) amountDue = 0;
    }
    allocated = Math.round((allocated + amountDue) * 100) / 100;
    rows.push({
      installmentNumber: i,
      monthLabel: monthLabel(dueDate),
      dueDate,
      amountDue,
      paidAmount: 0,
      remainingAmount: amountDue,
      status: 'PENDING',
    });
  }
  return rows;
}

async function createScheduleForPlan(plan) {
  const rows = buildSchedule({
    remainingAmount: plan.remainingAmount,
    monthlyInstallment: plan.monthlyInstallment,
    durationMonths: plan.installmentDurationMonths,
    firstDueDate: plan.firstDueDate,
  });

  const docs = rows.map((row) => ({
    ...row,
    planId: plan._id,
    customerId: plan.customerId,
    investorId: plan.investorId || null,
  }));

  await Installment.insertMany(docs);
  return Installment.find({ planId: plan._id }).sort({ installmentNumber: 1 });
}

/** Recompute a single installment's status from its amountDue/paidAmount/dueDate/explicitlyMissed flag. */
function computeStatus(installment, today = startOfDay(new Date())) {
  const { amountDue, paidAmount, explicitlyMissed, dueDate } = installment;

  if (explicitlyMissed && paidAmount <= 0) {
    return 'MISSED';
  }
  if (paidAmount >= amountDue && amountDue > 0) {
    return 'PAID';
  }
  if (paidAmount > 0 && paidAmount < amountDue) {
    return 'PARTIAL';
  }
  // paidAmount is 0 and not explicitly missed
  if (startOfDay(dueDate) < today) {
    return 'OVERDUE';
  }
  return 'PENDING';
}

/** Refresh PENDING installments whose due date has passed into OVERDUE. Never touches PAID/PARTIAL/MISSED. */
async function refreshOverdueStatuses() {
  const today = startOfDay(new Date());
  await Installment.updateMany(
    { status: 'PENDING', dueDate: { $lt: today } },
    { $set: { status: 'OVERDUE' } }
  );
}

/** Recalculate and persist a plan's totalPaid, remainingAmount, and profit figures from real installment data. */
async function recalcPlanTotals(planId) {
  const plan = await InstallmentPlan.findById(planId);
  if (!plan) return null;

  const installments = await Installment.find({ planId });
  const totalPaid = installments.reduce((sum, i) => sum + i.paidAmount, 0);

  // Remaining = sellingPrice - downPayment - totalActualPayments (missed amounts stay outstanding, never subtracted)
  const remaining = plan.sellingPrice - plan.downPayment - totalPaid;
  plan.remainingAmount = Math.max(0, Math.round(remaining * 100) / 100);
  plan.totalPaid = Math.round(totalPaid * 100) / 100;
  plan.recalculateProfit();

  const allPaid = installments.length > 0 && installments.every((i) => i.status === 'PAID');
  if (allPaid && plan.status === 'ACTIVE') {
    plan.status = 'COMPLETED';
  } else if (!allPaid && plan.status === 'COMPLETED') {
    plan.status = 'ACTIVE';
  }

  await plan.save();
  return plan;
}

/**
 * Record an actual payment against an installment. amount MUST be > 0.
 * Creates a Payment record and updates the installment + plan totals.
 */
async function recordPayment({ installmentId, amount, paymentMethod, paymentDate, notes }) {
  if (!(amount > 0)) {
    const err = new Error('Payment amount must be greater than 0. Use the missed-installment endpoint to record a 0 payment.');
    err.statusCode = 400;
    throw err;
  }

  const installment = await Installment.findById(installmentId);
  if (!installment) {
    const err = new Error('Installment not found');
    err.statusCode = 404;
    throw err;
  }

  const outstandingForInstallment = Math.round((installment.amountDue - installment.paidAmount) * 100) / 100;
  if (amount - outstandingForInstallment > 0.009) {
    const err = new Error('Payment amount cannot exceed the outstanding amount.');
    err.statusCode = 400;
    throw err;
  }

  const plan = await InstallmentPlan.findById(installment.planId);
  const previousBalance = plan.remainingAmount;

  installment.paidAmount = Math.round((installment.paidAmount + amount) * 100) / 100;
  installment.remainingAmount = Math.max(0, Math.round((installment.amountDue - installment.paidAmount) * 100) / 100);
  installment.paymentDate = paymentDate ? new Date(paymentDate) : new Date();
  installment.notes = notes || installment.notes;
  // A real payment overrides a previous MISSED flag for this installment
  if (installment.paidAmount > 0) installment.explicitlyMissed = false;
  installment.status = computeStatus(installment);
  await installment.save();

  const updatedPlan = await recalcPlanTotals(plan._id);

  const receiptNumber = await generateReceiptNumber();
  const payment = await Payment.create({
    customerId: installment.customerId,
    planId: installment.planId,
    installmentId: installment._id,
    investorId: installment.investorId || null,
    amount,
    paymentDate: installment.paymentDate,
    paymentMethod: paymentMethod || 'Cash',
    receiptNumber,
    previousBalance,
    newBalance: updatedPlan.remainingAmount,
    notes: notes || '',
  });

  await safelyRecalculateProfitDistribution(plan._id);

  return { installment, plan: updatedPlan, payment };
}

/**
 * Recalculates this contract's profit distribution after a payment, if it has any
 * investor funding. Isolated in a try/catch so a profit-distribution recalculation
 * issue can never block the payment itself from being recorded — the payment and
 * installment/plan updates above are already durably saved at this point.
 */
async function safelyRecalculateProfitDistribution(planId) {
  try {
    // Required lazily to avoid a circular require (accountingService doesn't need
    // this module, but keeping the require local here is the simplest safe pattern).
    const accountingService = require('./accountingService');
    await accountingService.calculateProfitDistribution(planId);
  } catch (err) {
    console.error('Profit distribution recalculation failed for plan', planId, err.message);
  }
}

/**
 * Record an explicit 0 / missed installment event. Does NOT create a Payment record
 * and does NOT reduce the plan's remaining balance.
 */
async function recordMissed({ installmentId, recordedDate, reason }) {
  const installment = await Installment.findById(installmentId);
  if (!installment) {
    const err = new Error('Installment not found');
    err.statusCode = 404;
    throw err;
  }

  const missedAmount = Math.round((installment.amountDue - installment.paidAmount) * 100) / 100;

  installment.explicitlyMissed = true;
  installment.paymentDate = recordedDate ? new Date(recordedDate) : new Date();
  installment.status = 'MISSED';
  await installment.save();

  const event = await MissedInstallmentEvent.create({
    installmentId: installment._id,
    customerId: installment.customerId,
    planId: installment.planId,
    amountDue: installment.amountDue,
    paidAmount: installment.paidAmount,
    missedAmount,
    recordedDate: installment.paymentDate,
    reason: reason || '',
  });

  const plan = await recalcPlanTotals(installment.planId);
  return { installment, plan, event };
}

/**
 * Change the installment duration for a plan. Historical PAID/PARTIAL/MISSED installments
 * are left completely untouched. Only future PENDING/OVERDUE (unpaid) installments are
 * deleted and regenerated across the new remaining duration.
 */
async function changeDuration({ planId, newDurationMonths }) {
  const plan = await InstallmentPlan.findById(planId);
  if (!plan) {
    const err = new Error('Plan not found');
    err.statusCode = 404;
    throw err;
  }

  const allInstallments = await Installment.find({ planId }).sort({ installmentNumber: 1 });
  const settled = allInstallments.filter((i) => ['PAID', 'PARTIAL', 'MISSED'].includes(i.status));
  const unsettled = allInstallments.filter((i) => !['PAID', 'PARTIAL', 'MISSED'].includes(i.status));

  const newFutureCount = newDurationMonths - settled.length;
  if (newFutureCount < 0) {
    const err = new Error(
      `New duration (${newDurationMonths}) must be at least the number of already-settled installments (${settled.length}).`
    );
    err.statusCode = 400;
    throw err;
  }

  // Amount already scheduled for settled installments stays fixed; spread the rest.
  const settledScheduledTotal = settled.reduce((sum, i) => sum + i.amountDue, 0);
  const remainingScheduledTotal = Math.max(0, Math.round((plan.sellingPrice - plan.downPayment - settledScheduledTotal) * 100) / 100);

  if (newFutureCount === 0 && remainingScheduledTotal > 0) {
    const err = new Error(
      `Cannot set duration to ${newDurationMonths} months because there is still ${remainingScheduledTotal} balance remaining to be scheduled.`
    );
    err.statusCode = 400;
    throw err;
  }

  // Remove unsettled (future) installments and regenerate them
  const unsettledIds = unsettled.map((i) => i._id);
  await Installment.deleteMany({ _id: { $in: unsettledIds } });

  if (newFutureCount > 0) {
    const lastSettledDueDate = settled.length > 0 ? settled[settled.length - 1].dueDate : plan.firstDueDate;
    const newMonthly = Math.round((remainingScheduledTotal / newFutureCount) * 100) / 100;
    const newRows = buildSchedule({
      remainingAmount: remainingScheduledTotal,
      monthlyInstallment: newMonthly,
      durationMonths: newFutureCount,
      firstDueDate: settled.length > 0 ? addMonths(lastSettledDueDate, 1) : plan.firstDueDate,
    }).map((row, idx) => ({
      ...row,
      installmentNumber: settled.length + idx + 1,
      planId: plan._id,
      customerId: plan.customerId,
      investorId: plan.investorId || null,
    }));
    await Installment.insertMany(newRows);
    plan.monthlyInstallment = newMonthly;
  }

  plan.installmentDurationMonths = newDurationMonths;
  await plan.save();
  await refreshOverdueStatuses();
  const updatedPlan = await recalcPlanTotals(plan._id);
  const schedule = await Installment.find({ planId }).sort({ installmentNumber: 1 });
  return { plan: updatedPlan, schedule };
}

/**
 * Change the monthly installment amount. Only future unpaid (PENDING/OVERDUE) installments
 * are recalculated; PAID/PARTIAL/MISSED history is untouched.
 */
async function changeMonthlyInstallment({ planId, newMonthlyInstallment }) {
  const plan = await InstallmentPlan.findById(planId);
  if (!plan) {
    const err = new Error('Plan not found');
    err.statusCode = 404;
    throw err;
  }

  const allInstallments = await Installment.find({ planId }).sort({ installmentNumber: 1 });
  const settled = allInstallments.filter((i) => ['PAID', 'PARTIAL', 'MISSED'].includes(i.status));
  const unsettled = allInstallments.filter((i) => !['PAID', 'PARTIAL', 'MISSED'].includes(i.status));

  const settledScheduledTotal = settled.reduce((sum, i) => sum + i.amountDue, 0);
  const remainingScheduledTotal = Math.max(0, Math.round((plan.sellingPrice - plan.downPayment - settledScheduledTotal) * 100) / 100);

  const newFutureCount = Math.max(1, Math.ceil(remainingScheduledTotal / newMonthlyInstallment));

  const unsettledIds = unsettled.map((i) => i._id);
  await Installment.deleteMany({ _id: { $in: unsettledIds } });

  const lastSettledDueDate = settled.length > 0 ? settled[settled.length - 1].dueDate : plan.firstDueDate;
  const newRows = buildSchedule({
    remainingAmount: remainingScheduledTotal,
    monthlyInstallment: newMonthlyInstallment,
    durationMonths: newFutureCount,
    firstDueDate: settled.length > 0 ? addMonths(lastSettledDueDate, 1) : plan.firstDueDate,
  }).map((row, idx) => ({
    ...row,
    installmentNumber: settled.length + idx + 1,
    planId: plan._id,
    customerId: plan.customerId,
    investorId: plan.investorId || null,
  }));
  await Installment.insertMany(newRows);

  plan.monthlyInstallment = newMonthlyInstallment;
  plan.installmentDurationMonths = settled.length + newFutureCount;
  await plan.save();
  await refreshOverdueStatuses();
  const updatedPlan = await recalcPlanTotals(plan._id);
  const schedule = await Installment.find({ planId }).sort({ installmentNumber: 1 });
  return { plan: updatedPlan, schedule };
}

module.exports = {
  buildSchedule,
  createScheduleForPlan,
  computeStatus,
  refreshOverdueStatuses,
  recalcPlanTotals,
  recordPayment,
  recordMissed,
  changeDuration,
  changeMonthlyInstallment,
};
