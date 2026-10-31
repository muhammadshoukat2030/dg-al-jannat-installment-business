import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, PlusCircle } from 'lucide-react';
import { withdrawalApi, investorApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import DateFilterBar from '../components/common/DateFilterBar';
import WithdrawalModal from '../components/investors/WithdrawalModal';
import { queryWithdrawalsOffline, queryInvestorsOffline } from '../offline/db';

export default function Withdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [investorFilter, setInvestorFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // 1. Local-first
    queryInvestorsOffline({ limit: 200 }).then((local) => {
      if (local && local.data.length > 0) setInvestors(local.data);
    }).catch(() => {});

    // 2. Server revalidation
    investorApi.list({ limit: 200 }).then((res) => setInvestors(res.data.data)).catch(() => {});
  }, []);

  function refresh() {
    setLoading(true);
    // 1. Local-first
    queryWithdrawalsOffline({ page, limit: 20, investorId: investorFilter || undefined }).then((local) => {
      if (local && local.data.length > 0) {
        setWithdrawals(local.data);
        setPages(local.pages || 1);
        setLoading(false);
      }
    }).catch(() => {});

    // 2. Server revalidation
    withdrawalApi
      .list({ page, limit: 20, investorId: investorFilter || undefined, ...dateFilter })
      .then((res) => {
        setWithdrawals(res.data.data);
        setPages(res.data.pages || 1);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    refresh();
  }, [page, investorFilter, dateFilter]);

  // Search is client-side over the already-fetched page (small, paginated dataset) —
  // matching investor name, reference, or notes. Server-side filters (investor,
  // date) are what keep this from ever loading the full withdrawal history at once.
  const filtered = search
    ? withdrawals.filter((w) => {
        const q = search.toLowerCase();
        return (
          w.investorId?.name?.toLowerCase().includes(q) ||
          w.reference?.toLowerCase().includes(q) ||
          w.notes?.toLowerCase().includes(q)
        );
      })
    : withdrawals;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Withdrawal History</h1>
        <button className="btn-primary" onClick={() => setShowModal(true)}>
          <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">Record Withdrawal</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search investor, reference, notes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={investorFilter} onChange={(e) => { setPage(1); setInvestorFilter(e.target.value); }}>
          <option value="">All Investors</option>
          {investors.map((inv) => (
            <option key={inv._id} value={inv._id}>{inv.name}</option>
          ))}
        </select>
        <DateFilterBar
          onChange={(f) => {
            setPage(1);
            setDateFilter(f);
          }}
        />
      </div>

      {/* Desktop table */}
      <div className="card p-0 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Investor</th>
              <th className="px-4 py-2 font-medium">Total</th>
              <th className="px-4 py-2 font-medium">Owner Share</th>
              <th className="px-4 py-2 font-medium">Investor Share</th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">Reference</th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">Notes</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">Loading...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-gray-400">No withdrawals found.</td></tr>}
            {!loading &&
              filtered.map((w) => (
                <tr key={w._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(w.withdrawalDate)}</td>
                  <td className="px-4 py-2">
                    <Link to={`/investors/${w.investorId?._id}`} className="text-primary-600 font-medium">{w.investorId?.name}</Link>
                  </td>
                  <td className="px-4 py-2 font-medium">{formatCurrency(w.totalAmount)}</td>
                  <td className="px-4 py-2">{formatCurrency(w.ownerAmount)}</td>
                  <td className="px-4 py-2">{formatCurrency(w.investorAmount)}</td>
                  <td className="px-4 py-2 hidden lg:table-cell text-gray-500">{w.reference || '-'}</td>
                  <td className="px-4 py-2 hidden lg:table-cell text-gray-500">{w.notes || '-'}</td>
                  <td className="px-4 py-2">
                    <span className="badge bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400">{w.status}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
        {!loading && filtered.length === 0 && <p className="text-center text-gray-400 py-6">No withdrawals found.</p>}
        {!loading &&
          filtered.map((w) => (
            <div key={w._id} className="card">
              <div className="flex justify-between items-start mb-2">
                <Link to={`/investors/${w.investorId?._id}`} className="font-medium text-primary-600">{w.investorId?.name}</Link>
                <span className="font-semibold">{formatCurrency(w.totalAmount)}</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">{formatDate(w.withdrawalDate)}</p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <p>Owner: {formatCurrency(w.ownerAmount)}</p>
                <p>Investor: {formatCurrency(w.investorAmount)}</p>
              </div>
              {(w.reference || w.notes) && (
                <p className="text-xs text-gray-400 mt-2">{[w.reference, w.notes].filter(Boolean).join(' · ')}</p>
              )}
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

      {showModal && (
        <WithdrawalModal
          onClose={() => setShowModal(false)}
          onSuccess={() => {
            setShowModal(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
