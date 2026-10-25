const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

const authRoutes = require('./routes/authRoutes');
const customerRoutes = require('./routes/customerRoutes');
const installmentPlanRoutes = require('./routes/installmentPlanRoutes');
const installmentRoutes = require('./routes/installmentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const exportRoutes = require('./routes/exportRoutes');
const investorRoutes = require('./routes/investorRoutes');
const investorExportRoutes = require('./routes/investorExportRoutes');
const ownerRoutes = require('./routes/ownerRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const fundingRoutes = require('./routes/fundingRoutes');

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}
app.use('/api', apiLimiter);

app.get('/api/health', (req, res) => res.json({ success: true, message: 'API is running.' }));

app.use('/api/auth', authRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/installment-plans', installmentPlanRoutes);
app.use('/api/installments', installmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/investors', investorRoutes);
app.use('/api/investor-exports', investorExportRoutes);
app.use('/api/owner', ownerRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/funding', fundingRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
