const express = require('express');
const {
  getSummary,
  getTransactions,
  getProfit,
  getCapital,
  addCapitalTransaction,
  getWithdrawals,
} = require('../controllers/ownerController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/summary', getSummary);
router.get('/transactions', getTransactions);
router.get('/profit', getProfit);
router.get('/capital', getCapital);
router.post('/capital', addCapitalTransaction);
router.get('/withdrawals', getWithdrawals);

module.exports = router;
