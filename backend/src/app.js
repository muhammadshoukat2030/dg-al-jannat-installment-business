const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

// Register all Mongoose models immediately
require('./models');
const connectDB = require('./config/db');
const { isAllowedOrigin } = require('./utils/corsHelper');

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
const ownerExportRoutes = require('./routes/ownerExportRoutes');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const fundingRoutes = require('./routes/fundingRoutes');
const syncRoutes = require('./routes/syncRoutes');

const app = express();

app.use(helmet());

const corsOptions = {
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key', 'Cache-Control'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Database connection lifecycle middleware for serverless invocations
app.use(async (req, res, next) => {
  // Allow health endpoint without blocking on database if DB is connecting
  if (req.path === '/api/health') return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error in request lifecycle:', err.message);
    res.status(503).json({ success: false, message: 'Database temporarily unavailable. Please retry.' });
  }
});

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
app.use('/api/owner-exports', ownerExportRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
app.use('/api/funding', fundingRoutes);
app.use('/api/sync', syncRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
