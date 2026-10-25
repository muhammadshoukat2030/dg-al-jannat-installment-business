const express = require('express');
const {
  receiptPdf,
  installmentSheetPdf,
  customerLedgerPdf,
  customerFullRecordPdf,
  dailyCollectionPdf,
  monthlyCollectionPdf,
  profitLossPdf,
  outstandingPdf,
  overduePdf,
  missedPdf,
  customersExcel,
  paymentsExcel,
  installmentsExcel,
  outstandingExcel,
  overdueExcel,
  missedExcel,
  profitLossExcel,
} = require('../controllers/exportController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

// Printable receipt / installment sheet (PDF)
router.get('/receipt/:paymentId/pdf', receiptPdf);
router.get('/installment-sheet/:planId/pdf', installmentSheetPdf);
router.get('/customer-ledger/pdf', customerLedgerPdf);
router.get('/customer-full-record/:customerId/pdf', customerFullRecordPdf);

// Report PDFs
router.get('/reports/daily/pdf', dailyCollectionPdf);
router.get('/reports/monthly/pdf', monthlyCollectionPdf);
router.get('/reports/profit-loss/pdf', profitLossPdf);
router.get('/reports/outstanding/pdf', outstandingPdf);
router.get('/reports/overdue/pdf', overduePdf);
router.get('/reports/missed/pdf', missedPdf);

// Excel exports
router.get('/customers/excel', customersExcel);
router.get('/payments/excel', paymentsExcel);
router.get('/installments/excel', installmentsExcel);
router.get('/outstanding/excel', outstandingExcel);
router.get('/overdue/excel', overdueExcel);
router.get('/missed/excel', missedExcel);
router.get('/profit-loss/excel', profitLossExcel);

module.exports = router;
