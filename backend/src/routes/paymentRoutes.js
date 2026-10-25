const express = require('express');
const { listPayments, getPayment } = require('../controllers/paymentController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', listPayments);
router.get('/:id', getPayment);

module.exports = router;
