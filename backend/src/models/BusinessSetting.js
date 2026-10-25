const mongoose = require('mongoose');

const businessSettingSchema = new mongoose.Schema(
  {
    businessName: { type: String, default: 'DJ AL-JANNAT INSTALLMENT BUSINESS' },
    ownerName: { type: String, default: '' },
    phone1: { type: String, default: '' },
    phone2: { type: String, default: '' },
    whatsapp: { type: String, default: '' },
    email: { type: String, default: '' },
    website: { type: String, default: '' },
    address: { type: String, default: '' },
    description: { type: String, default: '' },
    logoUrl: { type: String, default: '' },
    currency: { type: String, default: 'PKR' },
    timezone: { type: String, default: 'Asia/Karachi' },
    receiptFooter: { type: String, default: 'Thank you for your business.' },
    showProfitOnReceipt: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('BusinessSetting', businessSettingSchema);
