const express = require('express');
const { listWithdrawals, getWithdrawal, createWithdrawal } = require('../controllers/withdrawalController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', listWithdrawals);
router.post('/', createWithdrawal);
router.get('/:id', getWithdrawal);

module.exports = router;
