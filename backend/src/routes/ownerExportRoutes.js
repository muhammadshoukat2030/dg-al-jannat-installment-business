const express = require('express');
const {
  summaryPdf,
  transactionsPdf,
  fundedCustomersPdf,
  fundedContractsPdf,
  outstandingPdf,
  summaryExcel,
  transactionsExcel,
  fundedCustomersExcel,
  fundedContractsExcel,
} = require('../controllers/ownerExportController');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/summary/pdf', summaryPdf);
router.get('/transactions/pdf', transactionsPdf);
router.get('/funded-customers/pdf', fundedCustomersPdf);
router.get('/funded-contracts/pdf', fundedContractsPdf);
router.get('/outstanding/pdf', outstandingPdf);
router.get('/summary/excel', summaryExcel);
router.get('/transactions/excel', transactionsExcel);
router.get('/funded-customers/excel', fundedCustomersExcel);
router.get('/funded-contracts/excel', fundedContractsExcel);

module.exports = router;
