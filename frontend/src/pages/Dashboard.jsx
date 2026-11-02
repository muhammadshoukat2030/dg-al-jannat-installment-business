import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Users,
  UserCheck,
  UserX,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Wallet,
  AlertTriangle,
  PlusCircle,
  WifiOff,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { dashboardApi, ownerApi } from '../api/services';
import { useTheme } from '../context/ThemeContext';
import { formatCurrency, formatDate } from '../utils/format';
import StatCard from '../components/dashboard/StatCard';
import StatusBadge from '../components/common/StatusBadge';
import { getMetadata, setMetadata, getDashboardOffline, getOwnerDataOffline } from '../offline/db';

export default function Dashboard() {
  const { theme } = useTheme();
  const [data, setData] = useState(null);
  const [ownerProfit, setOwnerProfit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOfflineCache, setIsOfflineCache] = useState(false);

  useEffect(() => {
    let isMounted = true;

    // 1. Immediately read cached dashboard summary or derive from local IndexedDB
    getDashboardOffline()
      .then((cached) => {
        if (cached && isMounted) {
          setData(cached);
          setIsOfflineCache(!navigator.onLine);
          setLoading(false);
        }
      })
      .catch(() => {});

    getOwnerDataOffline()
      .then((ownerData) => {
        if (ownerData?.profit && isMounted) {
          setOwnerProfit(ownerData.profit);
        }
      })
      .catch(() => {});

    // 2. Fetch fresh live figures in background when online
    if (navigator.onLine) {
      Promise.all([dashboardApi.summary(), ownerApi.profit().catch(() => null)])
        .then(([summaryRes, ownerRes]) => {
          if (!isMounted) return;
          if (summaryRes?.data?.data) {
            setData(summaryRes.data.data);
            setIsOfflineCache(false);
            setMetadata('cachedDashboardSummary', summaryRes.data.data).catch(() => {});
          }
          if (ownerRes?.data?.data) {
            setOwnerProfit(ownerRes.data.data);
            getMetadata('ownerData').then((od) => {
              setMetadata('ownerData', { ...(od || {}), profit: ownerRes.data.data }).catch(() => {});
            }).catch(() => {});
          }
        })
        .catch(async () => {
          if (!isMounted) return;
          const localDash = await getDashboardOffline();
          if (localDash && isMounted) {
            setData(localDash);
            setIsOfflineCache(true);
          } else {
            setData((prev) => {
              if (!prev) setError('Failed to load dashboard and no offline cache is available.');
              return prev;
            });
          }
        })
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setIsOfflineCache(true);
      getDashboardOffline().then((localDash) => {
        if (localDash && isMounted) {
          setData(localDash);
        }
        if (isMounted) setLoading(false);
      });
      getOwnerDataOffline().then((ownerData) => {
        if (ownerData?.profit && isMounted) {
          setOwnerProfit(ownerData.profit);
        }
      });
    }

    return () => {
      isMounted = false;
    };
  }, []);

  if (loading && !data) return <div className="p-8 text-center text-gray-500">Loading dashboard...</div>;
  if (error && !data) return <div className="p-8 text-center text-red-500">{error}</div>;
  if (!data) return null;

  const business = data.business || {};
  const financial = data.financial || {};
  const collection = data.collection || {};
  const installments = data.installments || {};
  const profitLoss = data.profitLoss || {};
  const investorOverview = data.investorOverview || {};
  const topInvestors = Array.isArray(data.topInvestors) ? data.topInvestors : [];
  const topOutstanding = Array.isArray(data.topOutstanding) ? data.topOutstanding : [];
  const overdueCustomers = Array.isArray(data.overdueCustomers) ? data.overdueCustomers : [];
  const recentPayments = Array.isArray(data.recentPayments) ? data.recentPayments : [];
  const recentCustomers = Array.isArray(data.recentCustomers) ? data.recentCustomers : [];

  const displayCurrency = (val) => {
    if (val === undefined || val === null) return '—';
    return formatCurrency(val);
  };

  const displayCount = (val) => {
    if (val === undefined || val === null) return '—';
    return val;
  };

  const pieData = [
    { name: 'Profit', value: profitLoss.totalProfit || 0, color: '#16a34a' },
    { name: 'Loss', value: profitLoss.totalLoss || 0, color: '#dc2626' },
  ];

  const collectionData = [
    { name: 'Today', value: collection.today || 0 },
    { name: 'This Week', value: collection.thisWeek || 0 },
    { name: 'This Month', value: collection.thisMonth || 0 },
    { name: 'This Year', value: collection.thisYear || 0 },
  ];

  return (
    <div className="space-y-6">
      {isOfflineCache && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 px-4 py-2.5 rounded-xl text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-500" />
          <span>
            <strong>Offline Mode:</strong> Showing previously synchronized business metrics. Authoritative live figures will refresh when connection returns.
          </span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold flex items-center gap-2">
          Business Overview
        </h1>
        <div className="flex gap-2 flex-wrap">
          <Link to="/customers/new" className="btn-primary">
            <PlusCircle className="w-4 h-4" /> Add Customer
          </Link>
          <Link to="/customers" className="btn-secondary">View Customers</Link>
          <Link to="/reports" className="btn-secondary">Reports</Link>
        </div>
      </div>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">BUSINESS OVERVIEW</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Customers" value={displayCount(business.totalCustomers)} icon={Users} />
          <StatCard label="Active Customers" value={displayCount(business.activeCustomers)} icon={UserCheck} tone="good" />
          <StatCard label="Completed Customers" value={displayCount(business.completedCustomers)} icon={UserX} />
          <StatCard label="Active Contracts" value={displayCount(business.activeContracts)} icon={Wallet} />
          <StatCard label="Completed Contracts" value={displayCount(business.completedContracts)} icon={Wallet} tone="good" />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">BUSINESS FINANCIALS</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Sales" value={displayCurrency(financial.totalSales)} icon={DollarSign} />
          <StatCard label="Total Product Cost" value={displayCurrency(financial.totalProductCost)} icon={DollarSign} />
          <StatCard label="Total Collected" value={displayCurrency(financial.totalCollected)} icon={TrendingUp} tone="good" />
          <StatCard label="Total Remaining" value={displayCurrency(financial.totalRemaining)} icon={Wallet} tone="warn" />
          <StatCard label="Expected Profit" value={displayCurrency(financial.expectedProfit)} icon={TrendingUp} tone="good" />
          <StatCard label="Expected Loss" value={displayCurrency(financial.expectedLoss)} icon={TrendingDown} tone="bad" />
          <StatCard
            label="Net Expected Profit"
            value={displayCurrency(financial.netExpectedProfit)}
            icon={TrendingUp}
            tone={financial.netExpectedProfit >= 0 ? 'good' : 'bad'}
          />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-gray-500 mb-3">INSTALLMENT OVERVIEW</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Paid" value={displayCount(installments.paid)} tone="good" />
          <StatCard label="Partial" value={displayCount(installments.partial)} tone="warn" />
          <StatCard label="Pending" value={displayCount(installments.pending)} />
          <StatCard label="Missed" value={displayCount(installments.missed)} tone="bad" />
          <StatCard label="Overdue" value={displayCount(installments.overdue)} tone="bad" />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <StatCard label="Missed Amount" value={displayCurrency(installments.missedAmount)} tone="bad" />
          <StatCard label="Overdue Amount" value={displayCurrency(installments.overdueAmount)} tone="bad" />
        </div>
      </section>

      {ownerProfit && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500">OWNER</h2>
            <Link to="/owner" className="text-xs text-primary-600 hover:underline">View Owner Dashboard</Link>
          </div>
          <p className="text-xs text-gray-400 mb-3">
            The Owner's 50% profit share earned from investor-funded contracts — kept
            separate from investor capital and from overall business sales/profit above.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Total Owner Profit" value={displayCurrency(ownerProfit.totalOwnerProfit)} tone="good" />
            <StatCard label="Owner Profit Withdrawn" value={displayCurrency(ownerProfit.totalOwnerWithdrawn)} tone="warn" />
            <StatCard label="Owner Profit Remaining" value={displayCurrency(ownerProfit.totalOwnerRemaining)} tone="good" />
            <StatCard label="Investors Contributing" value={displayCount(Array.isArray(ownerProfit.perInvestor) ? ownerProfit.perInvestor.length : ownerProfit.investorsContributing)} />
          </div>
        </section>
      )}

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-500">INVESTORS</h2>
          <Link to="/investors" className="text-xs text-primary-600 hover:underline">View all investors</Link>
        </div>
        <p className="text-xs text-gray-400 mb-3">
          Investor capital is tracked separately from business sales/revenue/profit above — these are distinct
          accounting concepts and are never mixed.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <StatCard label="Total Investors" value={displayCount(investorOverview.totalInvestors)} />
          <StatCard label="Capital Received" value={displayCurrency(investorOverview.totalCapitalReceived)} />
          <StatCard label="Capital Returned" value={displayCurrency(investorOverview.totalCapitalReturned)} />
          <StatCard label="Capital Held" value={displayCurrency(investorOverview.totalCapitalHeld)} tone="good" />
          <StatCard label="Capital Deployed" value={displayCurrency(investorOverview.totalCapitalDeployed)} tone="warn" />
          <StatCard label="Recovered Capital" value={displayCurrency(investorOverview.totalRecoveredCapital)} tone="good" />
          <StatCard label="Capital Still Deployed" value={displayCurrency(investorOverview.totalCapitalStillDeployed != null ? investorOverview.totalCapitalStillDeployed : investorOverview.totalCapitalDeployed)} tone="warn" />
          <StatCard label="Profit Reinvested" value={displayCurrency(investorOverview.totalProfitReinvested)} tone="good" />
          <StatCard label="Capital Available" value={displayCurrency(investorOverview.totalCapitalAvailable)} tone="good" />
          <StatCard label="Investor-Funded Contracts" value={displayCount(investorOverview.contractsFunded)} />
        </div>

        {topInvestors.length > 0 && (
          <div className="card mt-4">
            <h3 className="text-sm font-semibold text-gray-500 mb-3">TOP INVESTORS</h3>
            <div className="space-y-2">
              {topInvestors.map((row, idx) => (
                <Link
                  to={`/investors/${row.investor?._id}`}
                  key={row.investor?._id || idx}
                  className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:opacity-80"
                >
                  <div>
                    <p className="font-medium">{row.investor?.name || 'Investor'}</p>
                    <p className="text-gray-500 text-xs">
                      Deployed: {formatCurrency(row.capitalDeployed || 0)} · Available: {formatCurrency(row.capitalAvailable || 0)}
                    </p>
                  </div>
                  <span className="font-semibold">{formatCurrency(row.totalInvested || 0)}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">COLLECTION OVERVIEW</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={collectionData}>
              <XAxis dataKey="name" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Bar dataKey="value" fill={theme === 'dark' ? '#10B981' : '#6C4CF1'} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">PROFIT VS LOSS</h2>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} dataKey="value" nameKey="name" outerRadius={80} label>
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => formatCurrency(v)} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
          <p className="text-xs text-gray-500 mt-2">
            {profitLoss.profitableContracts || 0} profitable · {profitLoss.lossContracts || 0} loss-making · {profitLoss.breakEvenContracts || 0} break-even
          </p>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500">TOP OUTSTANDING CUSTOMERS</h2>
          </div>
          <div className="space-y-2">
            {topOutstanding.length === 0 && <p className="text-sm text-gray-400">No outstanding balances.</p>}
            {topOutstanding.map((row, idx) => (
              <Link
                to={`/customers/${row.customer?._id}`}
                key={row.planId || idx}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:opacity-80"
              >
                <div>
                  <p className="font-medium">{row.customer?.name || 'Customer'}</p>
                  <p className="text-gray-500 text-xs">{row.customer?.contactNumber || '-'}</p>
                </div>
                <span className="font-semibold text-orange-600">{formatCurrency(row.remaining || 0)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <h2 className="text-sm font-semibold text-gray-500">OVERDUE CUSTOMERS</h2>
          </div>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {overdueCustomers.length === 0 && <p className="text-sm text-gray-400">No overdue installments.</p>}
            {overdueCustomers.map((row, idx) => (
              <Link
                to={`/customers/${row.customer?._id}`}
                key={idx}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:opacity-80"
              >
                <div>
                  <p className="font-medium">{row.customer?.name || 'Customer'}</p>
                  <p className="text-gray-500 text-xs">Installment #{row.installmentNumber} · {row.daysOverdue || 0}d overdue</p>
                </div>
                <span className="font-semibold text-red-600">{formatCurrency(row.remaining || 0)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">RECENT PAYMENTS</h2>
          <div className="space-y-2">
            {recentPayments.length === 0 && <p className="text-sm text-gray-400">No payments yet.</p>}
            {recentPayments.map((p, idx) => (
              <div key={p._id || idx} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="font-medium">{p.customerId?.name || 'Customer'}</p>
                  <p className="text-gray-500 text-xs">{formatDate(p.paymentDate)}</p>
                </div>
                <span className="font-semibold text-green-600">{formatCurrency(p.amount || 0)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="text-sm font-semibold text-gray-500 mb-3">RECENTLY ADDED CUSTOMERS</h2>
          <div className="space-y-2">
            {recentCustomers.length === 0 && <p className="text-sm text-gray-400">No customers yet.</p>}
            {recentCustomers.map((c, idx) => (
              <Link
                to={`/customers/${c._id}`}
                key={c._id || idx}
                className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:opacity-80"
              >
                <div>
                  <p className="font-medium">{c.name || 'Customer'}</p>
                  <p className="text-gray-500 text-xs">{c.contactNumber || '-'}</p>
                </div>
                <span className="text-gray-400 text-xs">{formatDate(c.createdAt)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
