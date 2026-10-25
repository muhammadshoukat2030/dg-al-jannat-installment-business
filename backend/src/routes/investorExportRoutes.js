const express = require('express');
const {
  summaryPdf,
  transactionsPdf,
  fundedCustomersPdf,
  installmentsPdf,
  outstandingPdf,
  fullHistoryPdf,
  summaryExcel,
  transactionsExcel,
  customersExcel,
  contractsExcel,
  installmentsExcel,
  outstandingExcel,
} = require('../controllers/investorExportController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/:id/summary/pdf', summaryPdf);
router.get('/:id/transactions/pdf', transactionsPdf);
router.get('/:id/funded-customers/pdf', fundedCustomersPdf);
router.get('/:id/installments/pdf', installmentsPdf);
router.get('/:id/outstanding/pdf', outstandingPdf);
router.get('/:id/full-history/pdf', fullHistoryPdf);

router.get('/:id/summary/excel', summaryExcel);
router.get('/:id/transactions/excel', transactionsExcel);
router.get('/:id/customers/excel', customersExcel);
router.get('/:id/contracts/excel', contractsExcel);
router.get('/:id/installments/excel', installmentsExcel);
router.get('/:id/outstanding/excel', outstandingExcel);

module.exports = router;
