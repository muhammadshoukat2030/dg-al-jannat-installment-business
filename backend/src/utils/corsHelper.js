/**
 * Strict and trusted CORS origin validator for Installment Management System 6.
 * Allows trusted production domains, preview domains, and local development origins.
 * Never uses insecure wildcard '*' with credentials.
 */

const allowedOrigins = [
  'https://dg-al-jannat-installment-business-v.vercel.app',
  'https://dg-al-jannat-installment-business.vercel.app',
  process.env.CLIENT_URL,
].filter(Boolean);

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow non-browser requests (curl, mobile, serverless health probes)
  if (allowedOrigins.includes(origin)) return true;
  if (/^https:\/\/dg-al-jannat-installment-business[a-z0-9-]*\.vercel\.app$/.test(origin)) return true;
  if (process.env.NODE_ENV !== 'production') {
    if (/^http:\/\/localhost(:[0-9]+)?$/.test(origin) || /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/.test(origin)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  allowedOrigins,
  isAllowedOrigin,
};
