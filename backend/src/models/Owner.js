const mongoose = require('mongoose');

// Singleton-style document — there is exactly one Owner record for this single-admin
// system. Capital figures are always DERIVED from OwnerTransaction records (see that
// model), never edited directly, mirroring how Investor capital already works.
const ownerSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Owner' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Owner', ownerSchema);
