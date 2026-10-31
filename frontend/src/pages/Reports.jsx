import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { reportApi, exportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import DateFilterBar from '../components/common/DateFilterBar';
import { getReportOffline, setReportOffline, getAll } from '../offline/db';

const REPORTS = [
  { key: 'profit', label: 'Profit Report', pdf: 'profitLossPdf', excel: 'profitLossExcel', dateBased: false },
  { key: 'loss', label: 'Loss Report', pdf: 'profitLossPdf', excel: 'profitLossExcel', dateBased: false },
  { key: 'outstanding', label: 'Outstanding Report', pdf: 'outstandingPdf', excel: 'outstandingExcel', dateBased: false },
  { key: 'overdue', label: 'Overdue Report', pdf: 'overduePdf', excel: 'overdueExcel', dateBased: false },
  { key: 'missed', label: 'Missed Installment Report', pdf: 'missedPdf', excel: 'missedExcel', dateBased: false },
  { key: 'daily', label: 'Daily Collection', pdf: 'dailyCollectionPdf', excel: null, dateBased: true },
  { key: 'monthly', label: 'Monthly Collection', pdf: 'monthlyCollectionPdf', excel: null, dateBased: true },
];

export default function Reports() {
  const [active, setActive] = useState('profit');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  const activeReport = REPORTS.find((r) => r.key === active);

  async function computeOfflineReport(reportKey) {
    try {
      if (reportKey === 'profit' || reportKey === 'loss' || reportKey === 'outstanding') {
        const plans = await getAll('installmentPlans');
        if (reportKey === 'profit') {
          return plans.map((p) => ({
            customer: p.customerId,
            product: p.productName,
            purchaseCost: p.purchaseCost,
            sellingPrice: p.sellingPrice,
            expectedProfit: p.expectedProfit,
            expectedLoss: p.expectedLoss,
            profitMargin: Math.round((p.profitMargin || 0) * 100) / 100,
            totalCollected: (p.totalPaid || 0) + (p.downPayment || 0),
            remaining: p.remainingAmount,
            status: p.status,
          }));
        }
        if (reportKey === 'loss') return plans.filter((p) => (p.expectedLoss || 0) > 0);
        if (reportKey === 'outstanding') {
          return [...plans]
            .filter((p) => (p.remainingAmount || 0) > 0)
            .sort((a, b) => (b.remainingAmount || 0) - (a.remainingAmount || 0));
        }
      }
      if (reportKey === 'overdue' || reportKey === 'missed') {
        const installments = await getAll('installments');
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (reportKey === 'overdue') {
          return installments
            .filter((i) => i.status === 'OVERDUE' || (new Date(i.dueDate) < today && ((i.amountDue - (i.paidAmount || 0)) > 0)))
            .map((i) => {
              const d = new Date(i.dueDate);
              d.setHours(0, 0, 0, 0);
              return {
                customer: i.customerId,
                contract: i.planId,
                installmentNumber: i.installmentNumber,
                dueDate: i.dueDate,
                daysOverdue: Math.max(0, Math.floor((today - d) / (1000 * 60 * 60 * 24))),
                amountDue: i.amountDue,
                paid: i.paidAmount || 0,
                remaining: i.remainingAmount !== undefined ? i.remainingAmount : (i.amountDue - (i.paidAmount || 0)),
              };
            });
        }
        if (reportKey === 'missed') {
          return installments
            .filter((i) => i.status === 'MISSED')
            .map((i) => ({
              customerId: i.customerId,
              installmentId: i,
              recordedDate: i.updatedAt || i.dueDate,
            }));
        }
      }
      if (reportKey === 'daily' || reportKey === 'monthly') {
        const payments = await getAll('payments');
        const formatLen = reportKey === 'daily' ? 10 : 7;
        const map = new Map();
        payments.forEach((p) => {
          if (!p.paymentDate) return;
          const dStr = new Date(p.paymentDate).toISOString().slice(0, formatLen);
          if (!map.has(dStr)) map.set(dStr, { _id: dStr, total: 0, count: 0 });
          const entry = map.get(dStr);
          entry.total += Number(p.amount || 0);
          entry.count += 1;
        });
        return Array.from(map.values()).sort((a, b) => b._id.localeCompare(a._id));
      }
    } catch {
      return [];
    }
    return [];
  }

  async function loadReport(key, filter = dateFilter) {
    setActive(key);
    setLoading(true);

    // 1. Immediate local-first read from IndexedDB reports cache
    try {
      const cached = await getReportOffline(key);
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setRows(cached);
        setLoading(false);
      } else {
        const fallback = await computeOfflineReport(key);
        if (fallback && fallback.length > 0) {
          setRows(fallback);
          setLoading(false);
        }
      }
    } catch {
      // ignore
    }

    // 2. Server revalidation when online
    if (navigator.onLine) {
      try {
        const report = REPORTS.find((r) => r.key === key);
        const params = report?.dateBased ? filter : undefined;
        const res = await reportApi[key](params);
        if (res.data?.data) {
          setRows(res.data.data);
          await setReportOffline(key, res.data.data);
        }
      } catch (err) {
        // Retain existing local rows if offline or error
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport('profit');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExport(type) {
    const fnName = activeReport[type];
    if (!fnName) return;
    setExporting(true);
    try {
      await exportApi[fnName](activeReport.dateBased ? dateFilter : undefined);
    } catch (err) {
      toast.error(`Failed to export ${type.toUpperCase()}.`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3 no-print">
        <h1 className="text-xl font-bold">Reports</h1>
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" disabled={!activeReport?.pdf || exporting} onClick={() => handleExport('pdf')}>
            <FileDown className="w-4 h-4" /> <span className="hidden xs:inline">Export </span>PDF
          </button>
          <button className="btn-secondary" disabled={!activeReport?.excel || exporting} onClick={() => handleExport('excel')}>
            <FileSpreadsheet className="w-4 h-4" /> <span className="hidden xs:inline">Export </span>Excel
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            Print
          </button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap no-print">
        {REPORTS.map((r) => (
          <button
            key={r.key}
            onClick={() => loadReport(r.key)}
            className={`px-3 py-1.5 rounded-lg text-sm ${active === r.key ? 'bg-primary-600 text-white' : 'btn-secondary'}`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {activeReport?.dateBased && (
        <DateFilterBar
          className="no-print"
          onChange={(f) => {
            setDateFilter(f);
            loadReport(active, f);
          }}
        />
      )}

      <div className="card overflow-x-auto">
        {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
        {!loading && rows.length === 0 && <p className="text-center text-gray-400 py-6">No data for this report.</p>}
        {!loading && rows.length > 0 && <ReportTable reportKey={active} rows={rows} />}
      </div>
    </div>
  );
}

function ReportTable({ reportKey, rows }) {
  if (reportKey === 'profit' || reportKey === 'loss') {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Cost</th>
            <th className="px-3 py-2">Selling Price</th>
            <th className="px-3 py-2">Profit/Loss</th>
            <th className="px-3 py-2">Margin</th>
            <th className="px-3 py-2">Collected</th>
            <th className="px-3 py-2">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{r.customer?.name || r.customerId?.name}</td>
              <td className="px-3 py-2">{r.product || r.productName}</td>
              <td className="px-3 py-2">{formatCurrency(r.purchaseCost)}</td>
              <td className="px-3 py-2">{formatCurrency(r.sellingPrice)}</td>
              <td className="px-3 py-2">
                {r.expectedLoss > 0 ? (
                  <span className="text-red-600">-{formatCurrency(r.expectedLoss)}</span>
                ) : (
                  <span className="text-green-600">{formatCurrency(r.expectedProfit)}</span>
                )}
              </td>
              <td className="px-3 py-2">{r.profitMargin?.toFixed?.(2) ?? '-'}%</td>
              <td className="px-3 py-2">{formatCurrency(r.totalCollected ?? r.totalPaid)}</td>
              <td className="px-3 py-2">{formatCurrency(r.remaining ?? r.remainingAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (reportKey === 'outstanding') {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Selling Price</th>
            <th className="px-3 py-2">Paid</th>
            <th className="px-3 py-2">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{r.customerId?.name}</td>
              <td className="px-3 py-2">{r.customerId?.contactNumber}</td>
              <td className="px-3 py-2">{formatCurrency(r.sellingPrice)}</td>
              <td className="px-3 py-2">{formatCurrency(r.totalPaid)}</td>
              <td className="px-3 py-2 font-semibold text-orange-600">{formatCurrency(r.remainingAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (reportKey === 'overdue') {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Phone</th>
            <th className="px-3 py-2">Installment</th>
            <th className="px-3 py-2">Due Date</th>
            <th className="px-3 py-2">Days Overdue</th>
            <th className="px-3 py-2">Amount Due</th>
            <th className="px-3 py-2">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{r.customer?.name}</td>
              <td className="px-3 py-2">{r.customer?.contactNumber}</td>
              <td className="px-3 py-2">#{r.installmentNumber}</td>
              <td className="px-3 py-2">{formatDate(r.dueDate)}</td>
              <td className="px-3 py-2 text-red-600">{r.daysOverdue}</td>
              <td className="px-3 py-2">{formatCurrency(r.amountDue)}</td>
              <td className="px-3 py-2">{formatCurrency(r.remaining)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (reportKey === 'missed') {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Installment</th>
            <th className="px-3 py-2">Month</th>
            <th className="px-3 py-2">Amount Due</th>
            <th className="px-3 py-2">Missed Amount</th>
            <th className="px-3 py-2">Recorded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{r.customerId?.name}</td>
              <td className="px-3 py-2">#{r.installmentId?.installmentNumber}</td>
              <td className="px-3 py-2">{r.installmentId?.monthLabel}</td>
              <td className="px-3 py-2">{formatCurrency(r.amountDue)}</td>
              <td className="px-3 py-2 text-red-600">{formatCurrency(r.missedAmount)}</td>
              <td className="px-3 py-2">{formatDate(r.recordedDate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (reportKey === 'daily' || reportKey === 'monthly') {
    return (
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-left text-gray-500">
          <tr>
            <th className="px-3 py-2">{reportKey === 'daily' ? 'Date' : 'Month'}</th>
            <th className="px-3 py-2">Total Collected</th>
            <th className="px-3 py-2">No. of Payments</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{r._id}</td>
              <td className="px-3 py-2">{formatCurrency(r.total)}</td>
              <td className="px-3 py-2">{r.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return null;
}
