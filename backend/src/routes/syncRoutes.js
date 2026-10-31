const express = require('express');
const { bootstrapSync, deltaSync, pushSync } = require('../controllers/syncController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/bootstrap', bootstrapSync);
router.get('/delta', deltaSync);
router.post('/push', pushSync);

module.exports = router;
