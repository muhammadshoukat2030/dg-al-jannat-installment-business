import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, PlusCircle, Trash2, WifiOff, Loader2 } from 'lucide-react';
import { investorApi } from '../api/services';
import { formatCurrency } from '../utils/format';
import DeleteInvestorModal from '../components/investors/DeleteInvestorModal';
import StatusBadge from '../components/common/StatusBadge';
import { useSmartScroll } from '../hooks/useSmartScroll';
import { queryInvestorsOffline, getMetadata } from '../offline/db';

export default function Investors() {
  const [overview, setOverview] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchOnline = useCallback(
    (params) => investorApi.list(params).then((res) => res.data),
    []
  );

  const fetchOffline = useCallback(
    (params) => queryInvestorsOffline(params),
    []
  );

  const {
    items: investors,
    loading,
    loadingMore,
    hasMore,
    total,
    refresh,
    sentinelRef,
    isOfflineData,
  } = useSmartScroll({
    fetchOnline,
    fetchOffline,
    filters: { search, status },
    limit: 15,
  });

  useEffect(() => {
    // 1. Immediate local-first read from IndexedDB metadata
    getMetadata('cachedInvestorOverview')
      .then((cached) => {
        if (cached) setOverview(cached);
      })
      .catch(() => {});

    // 2. Server revalidation when online
    if (navigator.onLine) {
      investorApi
        .dashboardOverview()
        .then((res) => {
          if (res.data?.data?.overview) {
            setOverview(res.data.data.overview);
          }
        })
        .catch(() => {});
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Investors
            {isOfflineData && (
              <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Cache
              </span>
            )}
          </h1>
          {total > 0 && (
            <p className="text-xs text-theme-muted mt-0.5">
              Showing {investors.length} of {total} total investors
            </p>
          )}
        </div>

        <Link to="/investors/new" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">Add Investor</span>
        </Link>
      </div>

      {overview && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <OverviewCard label="Total Invested" value={formatCurrency(overview.totalCapitalInvested)} />
          <OverviewCard label="Total Returned" value={formatCurrency(overview.totalCapitalReturned)} />
          <OverviewCard label="Capital Held" value={formatCurrency(overview.totalCapitalHeld)} />
          <OverviewCard label="Capital Deployed" value={formatCurrency(overview.totalCapitalDeployed)} />
          <OverviewCard label="Capital Available" value={formatCurrency(overview.totalCapitalAvailable)} tone="good" />
          <OverviewCard label="Total Profit Earned" value={formatCurrency(overview.totalProfitEarned)} tone="good" />
          <OverviewCard label="Profit Withdrawn" value={formatCurrency(overview.totalProfitWithdrawn)} />
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, ID, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Desktop / tablet table */}
      <div className="card p-0 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Investor ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium text-right">Capital Held</th>
              <th className="px-4 py-2 font-medium text-right">Capital Available</th>
              <th className="px-4 py-2 font-medium text-right">Capital Deployed</th>
              <th className="px-4 py-2 font-medium text-right">Outstanding</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Loading investors...
                </td>
              </tr>
            )}
            {!loading && investors.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  No investors found.
                </td>
              </tr>
            )}
            {!loading &&
              investors.map((inv) => (
                <tr key={inv._id || inv.operationId} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{inv.investorId}</td>
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/investors/${inv._id}`} className="text-primary-600 hover:underline">
                      {inv.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{inv.phone}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.capitalHeld ?? inv.totalInvested)}</td>
                  <td className="px-4 py-2 text-right font-medium text-green-600">{formatCurrency(inv.capitalAvailable)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(inv.capitalDeployed)}</td>
                  <td className="px-4 py-2 text-right font-medium text-orange-600">{formatCurrency(inv.outstanding)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-2 no-print">
                    <button
                      className="text-red-600 hover:text-red-700 p-1"
                      onClick={() => setDeleteTarget(inv)}
                      aria-label={`Delete ${inv.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 sm:hidden">
        {loading && <p className="text-center text-gray-400 py-6">Loading investors...</p>}
        {!loading && investors.length === 0 && <p className="text-center text-gray-400 py-6">No investors found.</p>}
        {!loading &&
          investors.map((inv) => (
            <div key={inv._id || inv.operationId} className="card space-y-2">
              <div className="flex items-center justify-between">
                <Link to={`/investors/${inv._id}`} className="font-medium text-primary-600 truncate">
                  {inv.name}
                </Link>
                <div className="flex items-center gap-2">
                  <StatusBadge status={inv.status} />
                  <button className="text-red-600 p-1" onClick={() => setDeleteTarget(inv)} aria-label={`Delete ${inv.name}`}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-gray-500">{inv.investorId} · {inv.phone}</p>
              <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-gray-100 dark:border-gray-800">
                <div>
                  <p className="text-gray-400">Capital Held</p>
                  <p className="font-medium">{formatCurrency(inv.capitalHeld ?? inv.totalInvested)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Available</p>
                  <p className="font-medium text-green-600">{formatCurrency(inv.capitalAvailable)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Deployed</p>
                  <p className="font-medium">{formatCurrency(inv.capitalDeployed)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Outstanding</p>
                  <p className="font-medium text-orange-600">{formatCurrency(inv.outstanding)}</p>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="py-2 text-center text-xs text-theme-muted">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            <span>Loading additional investors...</span>
          </div>
        )}
        {!hasMore && investors.length > 0 && !loading && (
          <p className="py-2 text-gray-400">All {total} investors loaded</p>
        )}
      </div>

      {deleteTarget && (
        <DeleteInvestorModal
          investor={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function OverviewCard({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-theme-text font-bold',
    good: 'text-[#16A34A] dark:text-[#34D399] font-bold',
    bad: 'text-[#DC2626] dark:text-[#F87171] font-bold',
    warn: 'text-[#D97706] dark:text-[#FBBF24] font-bold',
  };
  return (
    <div className="card min-w-0 p-2.5 sm:p-3 bg-theme-card border-theme-border hover:bg-theme-card-hover transition-colors">
      <p className="text-[11px] sm:text-xs text-theme-muted mb-0.5 truncate">{label}</p>
      <p className={`text-sm sm:text-base md:text-lg break-words leading-tight ${tones[tone]}`}>{value}</p>
    </div>
  );
}
