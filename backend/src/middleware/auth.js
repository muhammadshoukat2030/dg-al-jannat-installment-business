const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Not authorized. No token provided.' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    let admin = null;
    try {
      admin = await Admin.findById(decoded.id);
    } catch {}

    if (!admin) {
      // Disaster Recovery check: if admins collection is empty or if this is an emergency token
      const adminCount = await Admin.countDocuments().catch(() => 0);
      if (adminCount === 0 || decoded.isEmergency || decoded.id === 'emergency_admin') {
        req.admin = {
          _id: 'emergency_admin',
          name: process.env.ADMIN_NAME || 'Owner',
          email: process.env.ADMIN_EMAIL || 'admin@localhost.com',
          role: 'admin',
          isEmergency: true,
        };
        req.isDisasterMode = true;
        return next();
      }
      return res.status(401).json({ success: false, message: 'Not authorized. Admin no longer exists.' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Not authorized. Invalid or expired token.' });
  }
}

module.exports = { protect };
