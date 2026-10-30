import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PlusCircle, Wallet, FileText, Download } from 'lucide-react';
import { ownerApi, investorApi, withdrawalApi, ownerExportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import WithdrawalModal from '../components/investors/WithdrawalModal';
import OwnerTransactionModal from '../components/investors/OwnerTransactionModal';

export default function OwnerDashboard() {
  const [profit, setProfit] = useState(null);
  const [capital, setCapital] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAddCapital, setShowAddCapital] = useState(false);
  const [txModalType, setTxModalType] = useState('PROFIT_CASH_WITHDRAWAL');

  function load() {
    setLoading(true);
    Promise.all([
      ownerApi.profit(),
      ownerApi.capital(),
      ownerApi.transactions({ page: 1, limit: 10 }),
      ownerApi.withdrawals({ page: 1, limit: 10 }),
    ])
      .then(([profitRes, capitalRes, txRes, wdRes]) => {
        setProfit(profitRes.data.data);
        setCapital(capitalRes.data.data);
        setTransactions(txRes.data.data);
        setWithdrawals(wdRes.data.data);
      })
      .catch(() => toast.error('Failed to load owner dashboard.'))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!profit) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-bold">Owner Dashboard</h1>
        <div className="flex gap-2 flex-wrap">
          <Link to="/owner/funded-customers" className="btn-secondary text-xs">Funded Customers</Link>
          <Link to="/owner/funded-contracts" className="btn-secondary text-xs">Funded Contracts</Link>
          <button className="btn-primary" onClick={() => setShowAddCapital(true)}>
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">New Transaction</span>
          </button>
          <button className="btn-secondary" onClick={() => setShowWithdraw(true)}>
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">50/50 Paired Withdrawal</span>
          </button>
        </div>
      </div>

      {/* Clean Owner Financial Summary */}
      <section className="card p-5 space-y-5 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-700/80 pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Owner Financial Summary</h2>
            <p className="text-xs text-gray-500">
              Clear breakdown of personal owner capital, 50% profit share, and withdrawable funds
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('CAPITAL_IN'); setShowAddCapital(true); }}
            >
              + Add Capital
            </button>
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('CAPITAL_RETURNED'); setShowAddCapital(true); }}
            >
              Return Capital
            </button>
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('PROFIT_TO_CAPITAL'); setShowAddCapital(true); }}
            >
              Reinvest Profit
            </button>
            <button
              className="btn-primary !text-xs !py-1.5"
              onClick={() => { setTxModalType('PROFIT_CASH_WITHDRAWAL'); setShowAddCapital(true); }}
            >
              Withdraw Profit
            </button>
          </div>
        </div>

        {/* Highlighted Banner: Total Amount Currently Available to Withdraw */}
        <div className="rounded-xl p-4 bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-primary-500/10 border border-emerald-500/20 dark:border-emerald-500/30">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-wider font-semibold text-emerald-800 dark:text-emerald-300">
                Total Currently Available to Withdraw (Owner)
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                {formatCurrency((capital?.capitalAvailable || 0) + (profit?.totalOwnerRemaining || 0))}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Strictly separated into available owner capital and available owner profit below
              </p>
            </div>

            <div className="flex flex-wrap gap-4 sm:gap-6 border-t md:border-t-0 md:border-l border-emerald-500/20 pt-3 md:pt-0 md:pl-6">
              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2.5 border border-emerald-500/20">
                <span className="text-[11px] font-medium text-gray-500 block">Available Capital</span>
                <span className="text-base font-bold text-gray-900 dark:text-gray-100">
                  {formatCurrency(capital?.capitalAvailable || 0)}
                </span>
                <span className="text-[10px] text-gray-400 block">Undeployed / recovered principal</span>
              </div>

              <div className="bg-white/80 dark:bg-gray-800/80 rounded-lg p-2.5 border border-emerald-500/20">
                <span className="text-[11px] font-medium text-gray-500 block">Available Profit</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(profit?.totalOwnerRemaining || 0)}
                </span>
                <span className="text-[10px] text-gray-400 block">Realized 50% profit share</span>
              </div>
            </div>
          </div>
        </div>

        {/* Capital Breakdown */}
        {capital && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
              Owner Capital Breakdown
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Original Capital</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                  {formatCurrency(capital.originalCapitalInvested || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Additional Capital</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                  {formatCurrency(capital.additionalCapitalAdded || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Capital Returned</span>
                <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5 block">
                  {formatCurrency(capital.totalCapitalReturned || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Capital Deployed</span>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                  {formatCurrency(capital.capitalDeployed || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Recovered Capital</span>
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                  {formatCurrency(capital.recoveredCapital || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
                <span className="text-gray-500 block">Capital Still Deployed</span>
                <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5 block">
                  {formatCurrency(capital.capitalStillDeployed || 0)}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                <span className="text-emerald-700 dark:text-emerald-300 font-medium block">Current Available Capital</span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                  {formatCurrency(capital.capitalAvailable || 0)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Profit Breakdown (50% Owner Share) */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
            Owner Profit Breakdown (50% Share from Contracts)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Total Profit Earned</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                {formatCurrency(profit.totalOwnerProfit || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Profit Withdrawn as Cash</span>
              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5 block">
                {formatCurrency(profit.totalOwnerCashWithdrawn || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Profit Transferred to Capital</span>
              <span className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-0.5 block">
                {formatCurrency(profit.totalOwnerProfitToCapital || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium block">Remaining Available Profit</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(profit.totalOwnerRemaining || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Export Actions */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500 self-center">Export:</span>
          <button className="btn-secondary !text-xs !py-1" onClick={() => ownerExportApi.summaryPdf().catch(() => toast.error('Export failed'))}>
            <FileText className="w-3 h-3 inline mr-1" />Summary PDF
          </button>
          <button className="btn-secondary !text-xs !py-1" onClick={() => ownerExportApi.transactionsPdf().catch(() => toast.error('Export failed'))}>
            Transactions PDF
          </button>
          <button className="btn-secondary !text-xs !py-1" onClick={() => ownerExportApi.fundedCustomersPdf().catch(() => toast.error('Export failed'))}>
            Funded Customers PDF
          </button>
          <button className="btn-secondary !text-xs !py-1" onClick={() => ownerExportApi.summaryExcel().catch(() => toast.error('Export failed'))}>
            <Download className="w-3 h-3 inline mr-1" />Summary Excel
          </button>
        </div>
      </section>

      {/* Operational stats cards */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card label="Capital Held" value={formatCurrency(capital?.capitalHeld || 0)} tone="good" />
        <Card label="Total Profit Withdrawn" value={formatCurrency(profit.totalOwnerWithdrawn)} tone="warn" />
        <Card label="Investors Contributing" value={profit.perInvestor.length} />
        <Card label="Available Profit" value={formatCurrency(profit.totalOwnerRemaining)} tone="good" />
      </section>

      <section className="card">
        <h2 className="font-semibold text-sm text-gray-500 mb-3">OWNER PROFIT BY INVESTOR</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Investor</th>
                <th className="px-3 py-2 font-medium">Owner Profit Share</th>
                <th className="px-3 py-2 font-medium hidden sm:table-cell">Withdrawn</th>
                <th className="px-3 py-2 font-medium">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {profit.perInvestor.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No investor-generated profit yet.</td></tr>
              )}
              {profit.perInvestor.map((row) => (
                <tr key={row.investorId} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">
                    <Link to={`/investors/${row.investorId}`} className="text-primary-600 font-medium">{row.investorName}</Link>
                  </td>
                  <td className="px-3 py-2">{formatCurrency(row.ownerProfitShare)}</td>
                  <td className="px-3 py-2 hidden sm:table-cell">{formatCurrency(row.ownerProfitWithdrawn)}</td>
                  <td className="px-3 py-2 text-green-600">{formatCurrency(row.ownerRemainingProfit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="font-semibold text-sm text-gray-500 mb-3">RECENT OWNER TRANSACTIONS</h2>
          {transactions.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No transactions yet.</p>}
          <div className="space-y-2">
            {transactions.map((t) => (
              <div key={t._id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="font-medium">{t.transactionType.replace(/_/g, ' ')}</p>
                  <p className="text-xs text-gray-500">{formatDate(t.transactionDate)} {t.investorId && `· ${t.investorId.name}`}</p>
                </div>
                <span className="font-semibold">{formatCurrency(t.amount)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="font-semibold text-sm text-gray-500 mb-3">RECENT WITHDRAWALS</h2>
          {withdrawals.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No withdrawals yet.</p>}
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w._id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="font-medium">{w.investorId?.name}</p>
                  <p className="text-xs text-gray-500">{formatDate(w.withdrawalDate)} · Owner {formatCurrency(w.ownerAmount)} / Investor {formatCurrency(w.investorAmount)}</p>
                </div>
                <span className="font-semibold">{formatCurrency(w.totalAmount)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showWithdraw && (
        <WithdrawalModal
          onClose={() => setShowWithdraw(false)}
          onSuccess={() => {
            setShowWithdraw(false);
            load();
          }}
        />
      )}

      {showAddCapital && (
        <OwnerTransactionModal
          capital={capital}
          profit={profit}
          defaultType={txModalType}
          onClose={() => setShowAddCapital(false)}
          onSuccess={() => {
            setShowAddCapital(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Card({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-theme-text font-bold',
    good: 'text-[#16A34A] dark:text-[#34D399] font-bold',
    bad: 'text-[#DC2626] dark:text-[#F87171] font-bold',
    warn: 'text-[#D97706] dark:text-[#FBBF24] font-bold',
  };
  return (
    <div className="card min-w-0 bg-theme-card border-theme-border hover:bg-theme-card-hover transition-colors">
      <p className="text-xs text-theme-muted mb-1 truncate">{label}</p>
      <p className={`text-base sm:text-lg break-words ${tones[tone]}`}>{value}</p>
    </div>
  );
}
