import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { paymentApi, exportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import ShareMenu from '../components/common/ShareMenu';
import DateFilterBar from '../components/common/DateFilterBar';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    setLoading(true);
    paymentApi
      .list({ page, limit: 20, ...dateFilter })
      .then((res) => {
        setPayments(res.data.data);
        setPages(res.data.pages || 1);
      })
      .finally(() => setLoading(false));
  }, [page, dateFilter]);

  async function handleExportExcel() {
    setExporting(true);
    try {
      await exportApi.paymentsExcel(dateFilter);
    } catch (err) {
      toast.error('Failed to export payments.');
    } finally {
      setExporting(false);
    }
  }

  async function handleReceipt(paymentId) {
    try {
      await exportApi.receiptPdf(paymentId);
    } catch (err) {
      toast.error('Failed to generate receipt.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <h1 className="text-xl font-bold">Payment History</h1>
        <button className="btn-secondary" disabled={exporting} onClick={handleExportExcel}>
          <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Export Excel</span>
        </button>
      </div>

      <DateFilterBar
        className="no-print"
        onChange={(f) => {
          setPage(1);
          setDateFilter(f);
        }}
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
                  Loading...
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
                <tr key={p._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-4 py-2 whitespace-nowrap">{formatDate(p.paymentDate)}</td>
                  <td className="px-4 py-2 max-w-[140px] truncate">{p.customerId?.name}</td>
                  <td className="px-4 py-2 hidden md:table-cell">#{p.installmentId?.installmentNumber}</td>
                  <td className="px-4 py-2 font-medium text-green-600 whitespace-nowrap">{formatCurrency(p.amount)}</td>
                  <td className="px-4 py-2 hidden sm:table-cell">{p.paymentMethod}</td>
                  <td className="px-4 py-2 hidden lg:table-cell">{formatCurrency(p.previousBalance)}</td>
                  <td className="px-4 py-2 hidden lg:table-cell">{formatCurrency(p.newBalance)}</td>
                  <td className="px-4 py-2 text-gray-500 hidden md:table-cell">{p.receiptNumber}</td>
                  <td className="px-4 py-2 no-print">
                    <div className="flex items-center gap-2">
                      <button
                        className="text-primary-600 text-xs font-medium hover:underline inline-flex items-center gap-1"
                        onClick={() => handleReceipt(p._id)}
                      >
                        <FileDown className="w-3 h-3" /> Receipt
                      </button>
                      <ShareMenu
                        getBlob={() => exportApi.receiptBlob(p._id)}
                        documentLabel={`Receipt ${p.receiptNumber}`}
                        customerPhone={p.customerId?.contactNumber}
                        customerEmail={p.customerId?.email}
                      />
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
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
    </div>
  );
}
