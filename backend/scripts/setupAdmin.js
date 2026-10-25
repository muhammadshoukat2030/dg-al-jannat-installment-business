/**
 * One-time script to create the single admin user.
 * Usage: npm run setup-admin
 * Reads ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SETUP_KEY from .env
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Admin = require('../src/models/Admin');

async function run() {
  const { MONGODB_URI, ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_SETUP_KEY } = process.env;

  if (!MONGODB_URI) throw new Error('MONGODB_URI is not set.');
  if (!ADMIN_NAME || !ADMIN_EMAIL || !ADMIN_PASSWORD) {
    throw new Error('ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD must be set in .env');
  }
  if (!ADMIN_SETUP_KEY) {
    throw new Error('ADMIN_SETUP_KEY must be set in .env as a safety confirmation before creating the admin.');
  }

  await mongoose.connect(MONGODB_URI);

  const existing = await Admin.findOne({ email: ADMIN_EMAIL.toLowerCase() });
  if (existing) {
    console.log(`Admin with email ${ADMIN_EMAIL} already exists. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const admin = await Admin.create({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL.toLowerCase(),
    password: ADMIN_PASSWORD, // hashed automatically by the Admin model's pre-save hook
  });

  console.log(`Admin created: ${admin.email}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
