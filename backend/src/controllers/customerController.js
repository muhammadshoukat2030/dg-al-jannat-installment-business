const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Installment = require('../models/Installment');
const Payment = require('../models/Payment');
const MissedInstallmentEvent = require('../models/MissedInstallmentEvent');
const asyncHandler = require('../middleware/asyncHandler');
const { generateCustomerId } = require('../utils/idGenerator');

const listCustomers = asyncHandler(async (req, res) => {
  const { search, status, page = 1, limit = 20 } = req.query;
  // Deleted customers never appear in any list view (active, archived, or all).
  const query = { isDeleted: { $ne: true } };

  if (status === 'archived') query.isArchived = true;
  else if (status === 'active') query.isArchived = false;

  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { contactNumber: { $regex: search, $options: 'i' } },
      { cnic: { $regex: search, $options: 'i' } },
      { customerId: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [customers, total] = await Promise.all([
    Customer.find(query).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Customer.countDocuments(query),
  ]);

  res.json({ success: true, data: customers, total, page: Number(page), pages: Math.ceil(total / limit) });
});

const getCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer || customer.isDeleted) return res.status(404).json({ success: false, message: 'Customer not found.' });

  const plans = await InstallmentPlan.find({ customerId: customer._id })
    .populate('investorId', 'name investorId')
    .sort({ createdAt: -1 });

  // Server-computed summary across ALL of this customer's contracts/products — never
  // trust a frontend total, and never limit the customer view to a single "active plan".
  const summary = plans.reduce(
    (acc, p) => {
      acc.totalContracts += 1;
      if (p.status === 'COMPLETED') acc.completedContracts += 1;
      else if (p.status === 'ACTIVE') acc.runningContracts += 1;
      else if (p.status === 'CANCELLED') acc.cancelledContracts += 1;
      acc.totalSale += p.sellingPrice;
      acc.totalPaid += (p.totalPaid || 0) + (p.downPayment || 0);
      acc.totalRemaining += p.remainingAmount;
      acc.totalExpectedProfit += p.expectedProfit;
      acc.totalExpectedLoss += p.expectedLoss;
      return acc;
    },
    {
      totalContracts: 0,
      completedContracts: 0,
      runningContracts: 0,
      cancelledContracts: 0,
      totalSale: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalExpectedProfit: 0,
      totalExpectedLoss: 0,
    }
  );

  res.json({ success: true, data: { customer, plans, summary } });
});

const createCustomer = asyncHandler(async (req, res) => {
  const { name, contactNumber } = req.body;
  if (!name || !contactNumber) {
    return res.status(400).json({ success: false, message: 'Name and contact number are required.' });
  }

  const customerId = await generateCustomerId();
  const customer = await Customer.create({ ...req.body, customerId });
  res.status(201).json({ success: true, data: customer });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer || customer.isDeleted) return res.status(404).json({ success: false, message: 'Customer not found.' });

  const { customerId, isDeleted, _id, createdAt, updatedAt, __v, ...updatable } = req.body;
  Object.assign(customer, updatable);
  await customer.save();
  res.json({ success: true, data: customer });
});

const archiveCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer || customer.isDeleted) return res.status(404).json({ success: false, message: 'Customer not found.' });

  customer.isArchived = true;
  await customer.save();
  res.json({ success: true, data: customer });
});

/**
 * Delete a customer (with confirmation handled on the frontend).
 *
 * - If the customer has NO financial history (no installment plans), the customer
 *   record is permanently removed — there is nothing to orphan.
 * - If the customer HAS financial history, we do a safe soft-delete: the customer
 *   is flagged isDeleted so it disappears from every customer list (active,
 *   archived, search — see listCustomers/getCustomer above), while their
 *   InstallmentPlan/Installment/Payment/MissedInstallmentEvent records remain
 *   intact in the database. This avoids destroying financial history or leaving
 *   broken/orphaned references in payments, reports, or ledgers.
 */
const deleteCustomer = asyncHandler(async (req, res) => {
  const customer = await Customer.findById(req.params.id);
  if (!customer || customer.isDeleted) {
    return res.status(404).json({ success: false, message: 'Customer not found.' });
  }

  const hasHistory = await InstallmentPlan.exists({ customerId: customer._id });

  if (!hasHistory) {
    await customer.deleteOne();
    return res.json({ success: true, message: `${customer.name} was permanently deleted.`, mode: 'hard' });
  }

  customer.isDeleted = true;
  customer.isArchived = true;
  await customer.save();

  res.json({
    success: true,
    message: `${customer.name} was deleted. Their financial history has been preserved for your records but they will no longer appear in your customer list.`,
    mode: 'soft',
  });
});

module.exports = { listCustomers, getCustomer, createCustomer, updateCustomer, archiveCustomer, deleteCustomer };
