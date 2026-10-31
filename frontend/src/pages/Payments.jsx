import { useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { FileDown, FileSpreadsheet, WifiOff, Loader2 } from 'lucide-react';
import { paymentApi, exportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import ShareMenu from '../components/common/ShareMenu';
import DateFilterBar from '../components/common/DateFilterBar';
import { useSmartScroll } from '../hooks/useSmartScroll';
import { queryPaymentsOffline } from '../offline/db';

export default function Payments() {
  const [exporting, setExporting] = useState(false);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  const fetchOnline = useCallback(
    (params) => paymentApi.list(params).then((res) => res.data),
    []
  );

  const fetchOffline = useCallback(
    (params) => queryPaymentsOffline(params),
    []
  );

  const {
    items: payments,
    loading,
    loadingMore,
    hasMore,
    total,
    sentinelRef,
    isOfflineData,
  } = useSmartScroll({
    fetchOnline,
    fetchOffline,
    filters: dateFilter,
    limit: 20,
  });

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportApi.paymentsExcel(dateFilter);
    } catch {
      toast.error('Failed to export payments.');
    } finally {
      setExporting(false);
    }
  }

  async function handleReceipt(paymentId) {
    try {
      await exportApi.receiptPdf(paymentId);
    } catch {
      toast.error('Failed to generate receipt.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Payment History
            {isOfflineData && (
              <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Cache
              </span>
            )}
          </h1>
          {total > 0 && (
            <p className="text-xs text-theme-muted mt-0.5">
              Showing {payments.length} of {total} payments recorded
            </p>
          )}
        </div>

        <button className="btn-secondary" disabled={exporting} onClick={handleExportExcel}>
          <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Export Excel</span>
        </button>
      </div>

      <DateFilterBar
        className="no-print"
        onChange={(f) => setDateFilter(f)}
      />

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Customer</th>
              <th className="px-4 py-2 font-medium hidden md:table-cell">Inst. No.</th>
              <th className="px-4 py-2 font-medium">Amount</th>
              <th className="px-4 py-2 font-medium hidden sm:table-cell">Method</th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">Previous Balance</th>
              <th className="px-4 py-2 font-medium hidden lg:table-cell">New Balance</th>
              <th className="px-4 py-2 font-medium hidden md:table-cell">Receipt #</th>
              <th className="px-4 py-2 font-medium no-print">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  Loading payments...
                </td>
              </tr>
            )}
            {!loading && payments.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  No payments recorded yet.
                </td>
              </tr>
            )}
            {!loading &&
              payments.map((p) => (
                <tr key={p._id || p.operationId} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                  <td className="px-4 py-2 max-w-[140px] truncate">
                    {p.customerId?.name || 'Customer'}
                    {p.isPendingSync && (
                      <span className="ml-1 badge bg-amber-500/10 text-amber-600 text-[10px]">
                        Sync Pending
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 hidden md:table-cell">#{p.installmentId?.installmentNumber || '—'}</td>
                  <td className="px-4 py-2 font-medium text-green-600 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-2 hidden sm:table-cell">{p.paymentMethod}</td>
                  <td className="px-4 py-2 hidden lg:table-cell">{p.previousBalance !== undefined ? formatCurrency(p.previousBalance) : '—'}</td>
                  <td className="px-4 py-2 hidden lg:table-cell">{p.newBalance !== undefined ? formatCurrency(p.newBalance) : '—'}</td>
                  <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{p.receiptNumber}</td>
                  <td className="px-4 py-2 no-print">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-primary-600 text-xs font-medium hover:underline inline-flex items-center gap-1"
                        onClick={() => handleReceipt(p._id)}
                        disabled={p.isPendingSync}
                        title={p.isPendingSync ? 'Server confirmation required for receipt PDF' : 'Download Receipt'}
                      >
                        <FileDown className="w-3 h-3" /> Receipt
                      </button>
                      {!p.isPendingSync && (
                        <ShareMenu
                          getBlob={() => exportApi.receiptBlob(p._id)}
                          documentLabel={`Receipt ${p.receiptNumber}`}
                          customerPhone={p.customerId?.contactNumber}
                          customerEmail={p.customerId?.email}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="py-2 text-center text-xs text-theme-muted">
        {loadingMore && (
          <div className="flex items-center justify-center gap-2 py-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary-600" />
            <span>Loading additional payments...</span>
          </div>
        )}
        {!hasMore && payments.length > 0 && !loading && (
          <p className="py-2 text-gray-400">All {total} payments loaded</p>
        )}
      </div>
    </div>
  );
}
