/**
 * Central Model Registry for Installment Management System 6
 * Ensures every Mongoose model is registered in Mongoose schema registry
 * upon app startup, preventing MissingSchemaError during population in
 * serverless lambdas or cold starts.
 */

const Admin = require('./Admin');
const BusinessSetting = require('./BusinessSetting');
const Customer = require('./Customer');
const FundingAllocation = require('./FundingAllocation');
const Installment = require('./Installment');
const InstallmentPlan = require('./InstallmentPlan');
const Investor = require('./Investor');
const InvestorTransaction = require('./InvestorTransaction');
const MissedInstallmentEvent = require('./MissedInstallmentEvent');
const Owner = require('./Owner');
const OwnerTransaction = require('./OwnerTransaction');
const Payment = require('./Payment');
const ProfitDistribution = require('./ProfitDistribution');
const Withdrawal = require('./Withdrawal');

module.exports = {
  Admin,
  BusinessSetting,
  Customer,
  FundingAllocation,
  Installment,
  InstallmentPlan,
  Investor,
  InvestorTransaction,
  MissedInstallmentEvent,
  Owner,
  OwnerTransaction,
  Payment,
  ProfitDistribution,
  Withdrawal,
};
