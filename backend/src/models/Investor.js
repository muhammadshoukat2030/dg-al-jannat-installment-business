const mongoose = require('mongoose');

const investorSchema = new mongoose.Schema(
  {
    investorId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    whatsapp: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    cnic: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    status: { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' },
    operationId: { type: String, sparse: true, unique: true },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

investorSchema.index({ name: 'text', phone: 'text', cnic: 'text', investorId: 'text' });
investorSchema.index({ status: 1 });
investorSchema.index({ isDeleted: 1 });
investorSchema.index({ isDeleted: 1, createdAt: -1 });
investorSchema.index({ updatedAt: 1 });

module.exports = mongoose.model('Investor', investorSchema);
