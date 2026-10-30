const express = require('express');
const {
  getSummary,
  getTransactions,
  getProfit,
  getCapital,
  addCapitalTransaction,
  ownerProfitTransaction,
  getWithdrawals,
} = require('../controllers/ownerController');
const { protect } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const ownerService = require('../services/ownerService');

const router = express.Router();
router.use(protect);

router.get('/summary', getSummary);
router.get('/transactions', getTransactions);
router.get('/profit', getProfit);
router.get('/capital', getCapital);
router.post('/capital', addCapitalTransaction);
router.post('/profit-transaction', ownerProfitTransaction);
router.get('/withdrawals', getWithdrawals);

router.get('/funded-summary', asyncHandler(async (req, res) => {
  const summary = await ownerService.getOwnerFundedSummary();
  res.json({ success: true, data: summary });
}));

router.get('/funded-customers', asyncHandler(async (req, res) => {
  const { search, page, limit } = req.query;
  const result = await ownerService.getOwnerFundedCustomers({ search, page, limit });
  res.json({ success: true, ...result });
}));

router.get('/funded-contracts', asyncHandler(async (req, res) => {
  const { search, status, page, limit, preset, from, to } = req.query;
  const result = await ownerService.getOwnerFundedContracts({ search, status, page, limit, preset, from, to });
  res.json({ success: true, ...result });
}));

module.exports = router;
