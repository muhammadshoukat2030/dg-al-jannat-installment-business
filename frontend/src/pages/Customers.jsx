import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, PlusCircle, FileSpreadsheet, Trash2, WifiOff, Loader2 } from 'lucide-react';
import { customerApi, exportApi } from '../api/services';
import { formatDate } from '../utils/format';
import DeleteCustomerModal from '../components/customers/DeleteCustomerModal';
import { useSmartScroll } from '../hooks/useSmartScroll';
import { queryCustomersOffline } from '../offline/db';

export default function Customers() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [deleteTarget, setDeleteTarget] = useState(null);

  const fetchOnline = useCallback(
    (params) => customerApi.list(params).then((res) => res.data),
    []
  );

  const fetchOffline = useCallback(
    (params) => queryCustomersOffline(params),
    []
  );

  const {
    items: customers,
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Customers
            {isOfflineData && (
              <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Cache
              </span>
            )}
          </h1>
          {total > 0 && (
            <p className="text-xs text-theme-muted mt-0.5">
              Showing {customers.length} of {total} total customers
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            className="btn-secondary"
            onClick={() => exportApi.customersExcel().catch(() => toast.error('Failed to export customers.'))}
          >
            <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Export Excel</span>
          </button>
          <Link to="/customers/new" className="btn-primary">
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">Add Customer</span>
          </Link>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" />
          <input
            className="input pl-9"
            placeholder="Search by name, phone, CNIC, ID..."
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
              <th className="px-4 py-2 font-medium">Customer ID</th>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">CNIC</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">Added</th>
              <th className="px-4 py-2 font-medium no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Loading customers...
                </td>
              </tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  No customers found.
                </td>
              </tr>
            )}
            {!loading &&
              customers.map((c) => (
                <tr key={c._id || c.operationId} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">
                    {c.customerId}
                    {c.isPendingSync && (
                      <span className="ml-1.5 badge bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                        Sync Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    <Link to={`/customers/${c._id}`} className="text-primary-600 hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.contactNumber}</td>
                  <td className="px-4 py-2 hidden lg:table-cell">{c.cnic || '—'}</td>
                  <td className="px-4 py-2">{c.city || '—'}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-2 no-print">
                    <button
                      className="text-red-600 hover:text-red-700 p-1"
                      onClick={() => setDeleteTarget(c)}
                      aria-label={`Delete ${c.name}`}
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
        {loading && <p className="text-center text-gray-400 py-6">Loading customers...</p>}
        {!loading && customers.length === 0 && <p className="text-center text-gray-400 py-6">No customers found.</p>}
        {!loading &&
          customers.map((c) => (
            <div key={c._id || c.operationId} className="card flex items-center justify-between gap-3">
              <Link to={`/customers/${c._id}`} className="min-w-0">
                <p className="font-medium text-primary-600 truncate flex items-center gap-1.5">
                  {c.name}
                  {c.isPendingSync && (
                    <span className="badge bg-amber-500/10 text-amber-600 text-[10px]">
                      Pending
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{c.customerId} · {c.contactNumber}</p>
                {c.cnic && <p className="text-xs text-gray-400">CNIC: {c.cnic}</p>}
                {c.city && <p className="text-xs text-gray-400">{c.city}</p>}
              </Link>
              <button className="text-red-600 shrink-0 p-2" onClick={() => setDeleteTarget(c)} aria-label={`Delete ${c.name}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
      </div>

      {/* Infinite Scroll Sentinel / Loading More Indicator */}
      <div ref={sentinelRef} className="py-2 text-center text-xs text-theme-muted">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            <span>Loading additional records...</span>
          </div>
        )}
        {!hasMore && customers.length > 0 && !loading && (
          <p className="py-2 text-gray-400">All {total} customers loaded</p>
        )}
      </div>

      {deleteTarget && (
        <DeleteCustomerModal
          customer={deleteTarget}
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
