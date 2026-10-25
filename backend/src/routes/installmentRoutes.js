const express = require('express');
const {
  listInstallments,
  getInstallment,
  payInstallment,
  markMissed,
} = require('../controllers/installmentController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', listInstallments);
router.get('/:id', getInstallment);
router.post('/:id/payment', payInstallment);
router.post('/:id/missed', markMissed);

module.exports = router;
