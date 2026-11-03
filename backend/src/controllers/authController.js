const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const asyncHandler = require('../middleware/asyncHandler');

function signToken(admin) {
  return jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'Email and password are required.' });
  }

  let admin = null;
  try {
    admin = await Admin.findOne({ email: email.toLowerCase() }).select('+password');
  } catch {}

  if (!admin) {
    // If admins collection is empty (e.g. database wiped or deleted), verify against environment disaster admin
    const adminCount = await Admin.countDocuments().catch(() => 0);
    const envEmail = (process.env.ADMIN_EMAIL || 'admin@localhost.com').toLowerCase();
    const envPass = process.env.ADMIN_PASSWORD || '12345';
    const envSetupKey = process.env.ADMIN_SETUP_KEY || 'setup12345';

    if (
      adminCount === 0 &&
      email.toLowerCase() === envEmail &&
      (password === envPass || password === envSetupKey)
    ) {
      const emergencyAdmin = {
        _id: 'emergency_admin',
        name: process.env.ADMIN_NAME || 'Owner',
        email: envEmail,
        isEmergency: true,
      };
      const token = jwt.sign(
        { id: emergencyAdmin._id, email: emergencyAdmin.email, isEmergency: true },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      return res.json({
        success: true,
        token,
        admin: { id: emergencyAdmin._id, name: emergencyAdmin.name, email: emergencyAdmin.email },
        isDisasterMode: true,
      });
    }

    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const match = await admin.comparePassword(password);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const token = signToken(admin);
  res.json({
    success: true,
    token,
    admin: { id: admin._id, name: admin.name, email: admin.email },
  });
});

const logout = asyncHandler(async (req, res) => {
  // Stateless JWT — logout is handled client-side by discarding the token.
  res.json({ success: true, message: 'Logged out.' });
});

const me = asyncHandler(async (req, res) => {
  res.json({ success: true, admin: { id: req.admin._id, name: req.admin.name, email: req.admin.email } });
});

module.exports = { login, logout, me };
