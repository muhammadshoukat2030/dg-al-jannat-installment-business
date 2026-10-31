import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { FileText, Download, ArrowLeft } from 'lucide-react';
import { ownerApi, ownerExportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import StatusBadge from '../components/common/StatusBadge';
import { queryOwnerFundedContractsOffline, getOwnerDataOffline } from '../offline/db';

export default function OwnerFundedContracts() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const limit = 20;

  async function load() {
    setLoading(true);
    // 1. Immediate local-first load from IndexedDB
    try {
      const [localContracts, localOwnerData] = await Promise.all([
        queryOwnerFundedContractsOffline({ search, status, page, limit }),
        getOwnerDataOffline(),
      ]);
      if (localContracts && localContracts.data.length > 0) {
        setData(localContracts.data);
        setTotal(localContracts.total);
        setLoading(false);
      }
      if (localOwnerData?.fundedSummary) {
        setSummary(localOwnerData.fundedSummary);
      }
    } catch {
      // fallback
    }

    // 2. Server revalidation
    Promise.all([
      ownerApi.fundedContracts({ search, status, page, limit }),
      ownerApi.fundedSummary(),
    ])
      .then(([contractsRes, summaryRes]) => {
        setData(contractsRes.data.data);
        setTotal(contractsRes.data.total);
        setSummary(summaryRes.data.data);
      })
      .catch(() => {
        // retain local data if offline
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => { setPage(1); }, [search, status]);
  useEffect(load, [search, status, page]);

  async function handleExport(type) {
    setExporting(true);
    try {
      if (type === 'pdf') await ownerExportApi.fundedContractsPdf();
      else await ownerExportApi.fundedContractsExcel();
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
          <h1 className="text-lg sm:text-xl font-bold">Owner Funded Contracts</h1>
          {summary && (
            <p className="text-xs text-theme-muted mt-0.5">
              {summary.contractsFunded} contracts · Deployed {formatCurrency(summary.totalCapitalDeployed)} · Outstanding {formatCurrency(summary.totalOutstanding)}
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

      {/* Summary Banner */}
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

      {/* Filters */}
      <div className="flex flex-wrap gap-2.5">
        <input
          type="text"
          placeholder="Search customer, product, contract..."
          className="input flex-1 min-w-[180px] text-xs sm:text-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="input w-auto text-xs sm:text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      {/* Desktop / Tablet Table */}
      <div className="card p-0 overflow-x-auto hidden md:block">
        {loading ? (
          <p className="text-center text-theme-muted py-8 text-xs">Loading...</p>
        ) : data.length === 0 ? (
          <p className="text-center text-theme-muted py-8 text-xs">No contracts found.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-theme-card-hover text-theme-muted text-left border-b border-theme-border">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Contract</th>
                <th className="px-3 py-2.5 font-semibold">Customer</th>
                <th className="px-3 py-2.5 font-semibold">Product</th>
                <th className="px-3 py-2.5 font-semibold text-right">Sale Price</th>
                <th className="px-3 py-2.5 font-semibold text-right">Cost</th>
                <th className="px-3 py-2.5 font-semibold text-right">Collected</th>
                <th className="px-3 py-2.5 font-semibold text-right">Outstanding</th>
                <th className="px-3 py-2.5 font-semibold text-center">Status</th>
                <th className="px-3 py-2.5 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-border">
              {data.map((p) => (
                <tr key={p._id} className="hover:bg-theme-card-hover transition-colors">
                  <td className="px-3 py-2 font-mono text-[11px] text-theme-primary font-semibold">{p.contractId}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{p.customerId?.name}</p>
                    <p className="text-[11px] text-theme-muted">{p.customerId?.contactNumber}</p>
                  </td>
                  <td className="px-3 py-2">{p.productName}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(p.sellingPrice)}</td>
                  <td className="px-3 py-2 text-right">{formatCurrency(p.purchaseCost)}</td>
                  <td className="px-3 py-2 text-right text-[#16A34A] dark:text-[#34D399] font-medium">{formatCurrency((p.totalPaid || 0) + (p.downPayment || 0))}</td>
                  <td className="px-3 py-2 text-right text-[#D97706] dark:text-[#FBBF24] font-medium">{formatCurrency(p.remainingAmount)}</td>
                  <td className="px-3 py-2 text-center">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-3 py-2 text-[11px] text-theme-muted">{formatDate(p.startDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Mobile Card List */}
      <div className="space-y-2.5 md:hidden">
        {loading && <p className="text-center text-theme-muted py-6 text-xs">Loading...</p>}
        {!loading && data.length === 0 && <p className="text-center text-theme-muted py-6 text-xs">No contracts found.</p>}
        {!loading &&
          data.map((p) => (
            <div key={p._id} className="card p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-theme-primary">{p.contractId}</span>
                <StatusBadge status={p.status} />
              </div>
              <div>
                <p className="font-bold text-sm text-theme-text">{p.customerId?.name || 'Customer'}</p>
                <p className="text-[11px] text-theme-muted">{p.productName} · {p.customerId?.contactNumber}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 pt-2 border-t border-theme-border text-[11px]">
                <div>
                  <span className="text-theme-muted block">Sale Price</span>
                  <span className="font-semibold">{formatCurrency(p.sellingPrice)}</span>
                </div>
                <div>
                  <span className="text-theme-muted block">Collected</span>
                  <span className="font-semibold text-[#16A34A] dark:text-[#34D399]">{formatCurrency((p.totalPaid || 0) + (p.downPayment || 0))}</span>
                </div>
                <div>
                  <span className="text-theme-muted block">Remaining</span>
                  <span className="font-semibold text-[#D97706] dark:text-[#FBBF24]">{formatCurrency(p.remainingAmount)}</span>
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
