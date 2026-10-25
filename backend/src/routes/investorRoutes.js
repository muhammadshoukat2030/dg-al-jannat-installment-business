const express = require('express');
const {
  listInvestors,
  getInvestor,
  createInvestor,
  updateInvestor,
  archiveInvestor,
  deleteInvestor,
  listTransactions,
  createTransaction,
  fundedCustomers,
  fundedContracts,
  investorInstallments,
  investorPayments,
  dashboardOverview,
  investorProfit,
  investorProfitTransaction,
  investorWithdrawals,
} = require('../controllers/investorController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/dashboard-overview', dashboardOverview);

router.get('/', listInvestors);
router.post('/', createInvestor);
router.get('/:id', getInvestor);
router.put('/:id', updateInvestor);
router.delete('/:id', archiveInvestor);
router.delete('/:id/delete', deleteInvestor);

router.get('/:id/transactions', listTransactions);
router.post('/:id/transactions', createTransaction);

router.get('/:id/funded-customers', fundedCustomers);
router.get('/:id/funded-contracts', fundedContracts);
router.get('/:id/installments', investorInstallments);
router.get('/:id/payments', investorPayments);
router.get('/:id/profit', investorProfit);
router.post('/:id/profit-transaction', investorProfitTransaction);
router.get('/:id/withdrawals', investorWithdrawals);

module.exports = router;
