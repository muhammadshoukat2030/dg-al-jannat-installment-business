const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema(
  {
    customerId: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    fatherName: { type: String, trim: true, default: '' },
    cnic: { type: String, trim: true, default: '' },
    contactNumber: { type: String, required: true, trim: true },
    alternateContact: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    notes: { type: String, trim: true, default: '' },
    isArchived: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    operationId: { type: String, sparse: true, unique: true, index: true },
  },
  { timestamps: true }
);

customerSchema.index({ name: 'text', contactNumber: 'text', cnic: 'text', customerId: 'text' });
customerSchema.index({ isDeleted: 1, isArchived: 1 });

module.exports = mongoose.model('Customer', customerSchema);
