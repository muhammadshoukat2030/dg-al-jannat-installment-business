import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Search, PlusCircle, FileSpreadsheet, Trash2 } from 'lucide-react';
import { customerApi, exportApi } from '../api/services';
import { formatDate } from '../utils/format';
import DeleteCustomerModal from '../components/customers/DeleteCustomerModal';

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);

  function refresh() {
    setLoading(true);
    customerApi
      .list({ search, status, page, limit: 15 })
      .then((res) => {
        setCustomers(res.data.data);
        setPages(res.data.pages || 1);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    const timer = setTimeout(refresh, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, status, page]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Customers</h1>
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
                  Loading...
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
                <tr key={c._id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="px-4 py-2">
                    <Link to={`/customers/${c._id}`} className="text-primary-600 font-medium">
                      {c.customerId}
                    </Link>
                  </td>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2">{c.contactNumber}</td>
                  <td className="px-4 py-2 hidden lg:table-cell text-gray-500">{c.cnic || '-'}</td>
                  <td className="px-4 py-2">{c.city || '-'}</td>
                  <td className="px-4 py-2 text-gray-500">{formatDate(c.createdAt)}</td>
                  <td className="px-4 py-2 no-print">
                    <button
                      className="text-red-600 text-xs font-medium hover:underline inline-flex items-center gap-1"
                      onClick={() => setDeleteTarget(c)}
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
      <div className="space-y-3 sm:hidden">
        {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
        {!loading && customers.length === 0 && <p className="text-center text-gray-400 py-6">No customers found.</p>}
        {!loading &&
          customers.map((c) => (
            <div key={c._id} className="card flex items-center justify-between gap-3">
              <Link to={`/customers/${c._id}`} className="min-w-0">
                <p className="font-medium text-primary-600 truncate">{c.name}</p>
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
