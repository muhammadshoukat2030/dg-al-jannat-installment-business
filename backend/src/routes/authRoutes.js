const express = require('express');
const { login, logout, me } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

router.post('/login', authLimiter, login);
router.post('/logout', protect, logout);
router.get('/me', protect, me);

module.exports = router;
