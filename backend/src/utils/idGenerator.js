const Customer = require('../models/Customer');
const InstallmentPlan = require('../models/InstallmentPlan');
const Payment = require('../models/Payment');
const Investor = require('../models/Investor');

async function generateInvestorId() {
  const latest = await Investor.findOne({}, { investorId: 1 }).sort({ investorId: -1 });
  let nextNum = 1;
  if (latest && latest.investorId) {
    const match = latest.investorId.match(/\d+/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  return `INV-${String(nextNum).padStart(4, '0')}`;
}

async function generateCustomerId() {
  const latest = await Customer.findOne({}, { customerId: 1 }).sort({ customerId: -1 });
  let nextNum = 1;
  if (latest && latest.customerId) {
    const match = latest.customerId.match(/\d+/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  return `CUST-${String(nextNum).padStart(5, '0')}`;
}

async function generateContractId() {
  const latest = await InstallmentPlan.findOne({}, { contractId: 1 }).sort({ contractId: -1 });
  let nextNum = 1;
  if (latest && latest.contractId) {
    const match = latest.contractId.match(/\d+/);
    if (match) nextNum = parseInt(match[0], 10) + 1;
  }
  return `CON-${String(nextNum).padStart(5, '0')}`;
}

async function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const prefix = `RCPT-${year}-`;
  const latest = await Payment.findOne({ receiptNumber: new RegExp(`^${prefix}`) }, { receiptNumber: 1 }).sort({ receiptNumber: -1 });
  let nextNum = 1;
  if (latest && latest.receiptNumber) {
    const parts = latest.receiptNumber.split('-');
    const lastDigits = parts[parts.length - 1];
    nextNum = parseInt(lastDigits, 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(6, '0')}`;
}

module.exports = { generateCustomerId, generateContractId, generateReceiptNumber, generateInvestorId };

