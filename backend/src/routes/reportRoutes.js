const express = require('express');
const {
  dailyCollection,
  monthlyCollection,
  profitReport,
  lossReport,
  monthlyProfitReport,
  outstandingReport,
  overdueReport,
  missedReport,
  customerLedger,
} = require('../controllers/reportController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/daily', dailyCollection);
router.get('/monthly', monthlyCollection);
router.get('/profit', profitReport);
router.get('/loss', lossReport);
router.get('/monthly-profit', monthlyProfitReport);
router.get('/outstanding', outstandingReport);
router.get('/overdue', overdueReport);
router.get('/missed', missedReport);
router.get('/customer-ledger', customerLedger);

module.exports = router;
