const express = require('express');
const { allocateFunding, getFunding } = require('../controllers/fundingController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/:planId/allocate', allocateFunding);
router.get('/:planId', getFunding);

module.exports = router;
