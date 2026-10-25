const express = require('express');
const { summary, collections, profitLoss, overdue, outstanding } = require('../controllers/dashboardController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/summary', summary);
router.get('/collections', collections);
router.get('/profit-loss', profitLoss);
router.get('/overdue', overdue);
router.get('/outstanding', outstanding);

module.exports = router;
