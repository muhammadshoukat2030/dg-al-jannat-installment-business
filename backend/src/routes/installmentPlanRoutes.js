const express = require('express');
const {
  listPlans,
  getPlan,
  createPlan,
  updatePlan,
  updateDuration,
  updateMonthlyInstallment,
} = require('../controllers/installmentPlanController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', listPlans);
router.post('/', createPlan);
router.get('/:id', getPlan);
router.put('/:id', updatePlan);
router.patch('/:id/duration', updateDuration);
router.patch('/:id/monthly-installment', updateMonthlyInstallment);

module.exports = router;
