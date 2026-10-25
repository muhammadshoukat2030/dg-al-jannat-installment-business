import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, PlusCircle, Trash2 } from 'lucide-react';
import { investorApi } from '../api/services';
import { formatCurrency } from '../utils/format';
import DeleteInvestorModal from '../components/investors/DeleteInvestorModal';
import StatusBadge from '../components/common/StatusBadge';

export default function Investors() {
  const [investors, setInvestors] = useState([]);
  const [overview, setOverview] = useState(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  function refresh() {
    setLoading(true);
    investorApi
      .list({ search, status, page, limit: 15 })
      .then((res) => {
        setInvestors(res.data.data);
        setPages(res.data.pages || 1);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  useEffect(() => {
    investorApi.dashboardOverview().then((res) => setOverview(res.data.data.overview));
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Investors</h1>
        <Link to="/investors/new" className="btn-primary">
          <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">Add Investor</span>
        </Link>
      </div>

      {overview && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <OverviewCard label="Total Investors" value={overview.totalInvestors} />
          <OverviewCard label="Total Capital" value={formatCurrency(overview.totalCapitalReceived)} />
          <OverviewCard label="Capital Held" value={formatCurrency(overview.totalCapitalHeld)} tone="good" />
          <OverviewCard label="Capital Deployed" value={formatCurrency(overview.totalCapitalDeployed)} tone="warn" />
          <OverviewCard label="Recovered Capital" value={formatCurrency(overview.totalRecoveredCapital || 0)} tone="good" />
          <OverviewCard label="Capital Still Deployed" value={formatCurrency(overview.totalCapitalStillDeployed != null ? overview.totalCapitalStillDeployed : overview.totalCapitalDeployed)} tone="warn" />
          <OverviewCard label="Profit Reinvested" value={formatCurrency(overview.totalProfitReinvested || 0)} tone="good" />
          <OverviewCard label="Capital Available" value={formatCurrency(overview.totalCapitalAvailable)} tone="good" />
          <OverviewCard label="Customers Funded" value={overview.customersFunded} />
          <OverviewCard label="Contracts Funded" value={overview.contractsFunded} />
          <OverviewCard label="Collections" value={formatCurrency(overview.collectionsFromFundedContracts)} tone="good" />
          <OverviewCard label="Outstanding" value={formatCurrency(overview.outstandingFromFundedContracts)} tone="bad" />
        </div>
      )}

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, phone, CNIC, ID..."
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
          />
        </div>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </select>
      </div>

      {/* Desktop / tablet table */}
      <div className="card p-0 overflow-x-auto hidden md:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Investor ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Invested</th>
              <th className="px-4 py-2 font-medium">Deployed</th>
              <th className="px-4 py-2 font-medium">Available</th>
              <th className="px-4 py-2 font-medium">Customers</th>
              <th className="px-4 py-2 font-medium">Contracts</th>
              <th className="px-4 py-2 font-medium">Outstanding</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && investors.length === 0 && (
              <tr>
                <td colSpan={11} className="px-4 py-6 text-center text-gray-400">
                  No investors found.
                </td>
              </tr>
            )}
            {!loading &&
              investors.map((inv) => (
                <tr key={inv._id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2">
                    <Link to={`/investors/${inv._id}`} className="text-primary-600 font-medium">
                      {inv.investorId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{inv.name}</td>
                  <td className="px-4 py-2">{inv.phone}</td>
                  <td className="px-4 py-2">{formatCurrency(inv.totalInvested)}</td>
                  <td className="px-4 py-2">{formatCurrency(inv.capitalDeployed)}</td>
                  <td className="px-4 py-2 text-green-600">{formatCurrency(inv.capitalAvailable)}</td>
                  <td className="px-4 py-2">{inv.customersFunded}</td>
                  <td className="px-4 py-2">{inv.contractsFunded}</td>
                  <td className="px-4 py-2 text-orange-600">{formatCurrency(inv.outstanding)}</td>
                  <td className="px-4 py-2">
                    <StatusBadge status={inv.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'} />
                  </td>
                  <td className="px-4 py-2 no-print">
                    <button
                      className="text-red-600 text-xs font-medium hover:underline inline-flex items-center gap-1"
                      onClick={() => setDeleteTarget(inv)}
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="space-y-3 md:hidden">
        {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
        {!loading && investors.length === 0 && <p className="text-center text-gray-400 py-6">No investors found.</p>}
        {!loading &&
          investors.map((inv) => (
            <div key={inv._id} className="card">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/investors/${inv._id}`} className="min-w-0">
                  <p className="font-medium text-primary-600 truncate">{inv.name}</p>
                  <p className="text-xs text-gray-500">{inv.investorId} · {inv.phone}</p>
                </Link>
                <button className="text-red-600 shrink-0 p-2" onClick={() => setDeleteTarget(inv)} aria-label={`Delete ${inv.name}`}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                <div>
                  <p className="text-gray-400">Invested</p>
                  <p className="font-medium">{formatCurrency(inv.totalInvested)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Available</p>
                  <p className="font-medium text-green-600">{formatCurrency(inv.capitalAvailable)}</p>
                </div>
                <div>
                  <p className="text-gray-400">Customers / Contracts</p>
                  <p className="font-medium">{inv.customersFunded} / {inv.contractsFunded}</p>
                </div>
                <div>
                  <p className="text-gray-400">Outstanding</p>
                  <p className="font-medium text-orange-600">{formatCurrency(inv.outstanding)}</p>
                </div>
              </div>
            </div>
          ))}
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2 flex-wrap">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-lg text-sm ${p === page ? 'bg-primary-600 text-white' : 'btn-secondary'}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

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
    default: 'text-gray-900 dark:text-gray-100',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-orange-600 dark:text-orange-400',
  };
  return (
    <div className="card min-w-0">
      <p className="text-xs text-gray-500 mb-1 truncate">{label}</p>
      <p className={`text-base sm:text-lg font-semibold break-words ${tones[tone]}`}>{value}</p>
    </div>
  );
}
