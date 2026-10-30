import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Download, ArrowLeft } from 'lucide-react';
import { ownerApi, ownerExportApi } from '../api/services';
import { formatCurrency } from '../utils/format';

export default function OwnerFundedCustomers() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  function load() {
    setLoading(true);
    Promise.all([
      ownerApi.fundedCustomers({ search, page, limit }),
      ownerApi.fundedSummary(),
    ])
      .then(([customersRes, summaryRes]) => {
        setData(customersRes.data.data);
        setTotal(customersRes.data.total);
        setSummary(summaryRes.data.data);
      })
      .catch(() => toast.error('Failed to load customers.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { setPage(1); }, [search]);
  useEffect(load, [search, page]);

  async function handleExport(type) {
    setExporting(true);
    try {
      if (type === 'pdf') await ownerExportApi.fundedCustomersPdf();
      else await ownerExportApi.fundedCustomersExcel();
    } catch {
      toast.error('Export failed.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-2.5">
        <div>
          <h1 className="text-lg sm:text-xl font-bold">Owner Funded Customers</h1>
          {summary && (
            <p className="text-xs text-theme-muted mt-0.5">
              {summary.customersFunded} customers · {summary.contractsFunded} contracts
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to="/owner" className="btn-secondary !text-xs !py-1.5 flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <button
            className="btn-secondary !text-xs !py-1.5 flex items-center gap-1"
            disabled={exporting}
            onClick={() => handleExport('pdf')}
          >
            <FileText className="w-3.5 h-3.5" /> PDF
          </button>
          <button
            className="btn-secondary !text-xs !py-1.5 flex items-center gap-1"
            disabled={exporting}
            onClick={() => handleExport('excel')}
          >
            <Download className="w-3.5 h-3.5" /> Excel
          </button>
        </div>
      </div>

      {/* Summary grid */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
          {[
            { label: 'Customers Funded', value: summary.customersFunded },
            { label: 'Contracts Funded', value: summary.contractsFunded },
            { label: 'Total Collections', value: formatCurrency(summary.totalCollections) },
            { label: 'Total Outstanding', value: formatCurrency(summary.totalOutstanding) },
          ].map((s) => (
            <div key={s.label} className="card p-2.5 sm:p-3">
              <p className="text-theme-muted text-[11px] sm:text-xs">{s.label}</p>
              <p className="font-bold text-sm sm:text-base mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Search Input */}
      <input
        type="text"
        placeholder="Search customer name or ID..."
        className="input w-full sm:max-w-xs text-xs sm:text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Desktop / Tablet Table */}
      <div className="card p-0 overflow-x-auto hidden sm:block">
        {loading ? (
          <p className="text-center text-theme-muted py-8 text-xs">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-center text-theme-muted py-8 text-xs">No customers found.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-theme-card-hover text-theme-muted text-left border-b border-theme-border">
              <tr>
                <th className="px-3.5 py-2.5 font-semibold">Customer</th>
                <th className="px-3.5 py-2.5 font-semibold">Phone</th>
                <th className="px-3.5 py-2.5 font-semibold text-center">Contracts</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Capital Deployed</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Collected</th>
                <th className="px-3.5 py-2.5 font-semibold text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {data.map((row, i) => (
                <tr key={i} className="hover:bg-theme-card-hover transition-colors">
                  <td className="px-3.5 py-2 font-medium">{row.customer?.name || '—'}</td>
                  <td className="px-3.5 py-2 text-theme-muted">{row.customer?.contactNumber || '—'}</td>
                  <td className="px-3.5 py-2 text-center">{row.contractsFunded}</td>
                  <td className="px-3.5 py-2 text-right">{formatCurrency(row.deployed)}</td>
                  <td className="px-3.5 py-2 text-right text-[#16A34A] dark:text-[#34D399] font-medium">{formatCurrency(row.collected)}</td>
                  <td className="px-3.5 py-2 text-right text-[#D97706] dark:text-[#FBBF24] font-medium">{formatCurrency(row.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Card Layout */}
      <div className="space-y-2.5 sm:hidden">
        {loading && <p className="text-center text-theme-muted py-6 text-xs">Loading...</p>}
        {!loading && data.length === 0 && <p className="text-center text-theme-muted py-6 text-xs">No customers found.</p>}
        {!loading &&
          data.map((row, i) => (
            <div key={i} className="card p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-theme-text">{row.customer?.name || '—'}</span>
                <span className="badge bg-theme-sidebar text-theme-primary">{row.contractsFunded} Contracts</span>
              </div>
              <p className="text-theme-muted text-[11px]">{row.customer?.contactNumber || 'No phone'}</p>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-theme-border text-[11px]">
                <div>
                  <span className="text-theme-muted block">Deployed</span>
                  <span className="font-semibold">{formatCurrency(row.deployed)}</span>
                </div>
                <div>
                  <span className="text-theme-muted block">Collected</span>
                  <span className="font-semibold text-[#16A34A] dark:text-[#34D399]">{formatCurrency(row.collected)}</span>
                </div>
                <div>
                  <span className="text-theme-muted block">Outstanding</span>
                  <span className="font-semibold text-[#D97706] dark:text-[#FBBF24]">{formatCurrency(row.outstanding)}</span>
                </div>
              </div>
            </div>
          ))}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between text-xs pt-1">
          <span className="text-theme-muted">
            Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}
          </span>
          <div className="flex gap-1.5">
            <button className="btn-secondary !text-xs !py-1 !px-2.5" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button
              className="btn-secondary !text-xs !py-1 !px-2.5"
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
