/**
 * Strict and trusted CORS origin validator for Installment Management System 6.
 * Allows trusted production domains, preview domains, custom client domains, and local development origins.
 * Never uses insecure wildcard '*' with credentials.
 */

function getAllowedOrigins() {
  const envOrigins = [
    process.env.CLIENT_URL,
    process.env.ALLOWED_ORIGINS,
  ]
    .filter(Boolean)
    .flatMap((val) => val.split(',').map((s) => s.trim().replace(/\/+$/, '')))
    .filter(Boolean);

  const defaultProductionOrigins = [
    'https://dg-al-jannat-installment-business-v.vercel.app',
    'https://dg-al-jannat-installment-business.vercel.app',
  ];

  return Array.from(new Set([...defaultProductionOrigins, ...envOrigins]));
}

const allowedOrigins = getAllowedOrigins();

function isAllowedOrigin(origin) {
  if (!origin) return true; // allow non-browser requests (curl, mobile, serverless health probes)
  const normalizedOrigin = origin.trim().replace(/\/+$/, '');
  
  // Re-evaluate in case environment variables were populated dynamically
  const currentAllowed = getAllowedOrigins();
  if (currentAllowed.includes(normalizedOrigin)) return true;
  
  if (/^https:\/\/dg-al-jannat-installment-business[a-z0-9-]*\.vercel\.app$/.test(normalizedOrigin)) return true;
  
  if (process.env.NODE_ENV !== 'production') {
    if (/^http:\/\/localhost(:[0-9]+)?$/.test(normalizedOrigin) || /^http:\/\/127\.0\.0\.1(:[0-9]+)?$/.test(normalizedOrigin)) {
      return true;
    }
  }
  return false;
}

module.exports = {
  allowedOrigins,
  isAllowedOrigin,
};
