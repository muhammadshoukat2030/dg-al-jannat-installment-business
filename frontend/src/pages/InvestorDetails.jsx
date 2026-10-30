import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Edit, Printer, FileDown, Trash2, PlusCircle } from 'lucide-react';
import { investorApi, investorExportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import StatusBadge from '../components/common/StatusBadge';
import ShareMenu from '../components/common/ShareMenu';
import DeleteInvestorModal from '../components/investors/DeleteInvestorModal';
import DateFilterBar from '../components/common/DateFilterBar';
import WithdrawalModal from '../components/investors/WithdrawalModal';
import TransactionModal from '../components/investors/TransactionModal';

const TABS = [
  'Overview',
  'Transactions',
  'Funded Customers',
  'Funded Contracts',
  'Installments',
  'Payments',
  'Outstanding',
  'Withdrawals',
  'Reports',
];

export default function InvestorDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [investor, setInvestor] = useState(null);
  const [capital, setCapital] = useState(null);
  const [installmentStats, setInstallmentStats] = useState(null);
  const [profit, setProfit] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [showTxModal, setShowTxModal] = useState(false);
  const [txModalType, setTxModalType] = useState('PROFIT_CASH_WITHDRAWAL');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  const load = useCallback(async () => {
    const res = await investorApi.get(id);
    setInvestor(res.data.data.investor);
    setCapital(res.data.data.capital);
    setInstallmentStats(res.data.data.installmentStats);
    const profitRes = await investorApi.profit(id);
    setProfit(profitRes.data.data);
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!investor) return <div className="p-8 text-center text-gray-400">Investor not found.</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold">{investor.name}</h1>
          <p className="text-sm text-gray-500">
            {investor.investorId} · {investor.phone} <StatusBadge status={investor.status === 'ACTIVE' ? 'ACTIVE' : 'CANCELLED'} />
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/investors/${id}/edit`} className="btn-secondary">
            <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
          </Link>
          <button className="btn-primary" onClick={() => setShowTxModal(true)}>
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">New Transaction</span>
          </button>
          <button className="btn-secondary" onClick={() => setShowWithdrawModal(true)}>
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">50/50 Paired Withdrawal</span>
          </button>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print Summary</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => investorExportApi.fullHistoryPdf(id).catch(() => toast.error('Failed to open full history.'))}
          >
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Print Full History</span>
          </button>
          <ShareMenu
            getBlob={() => investorExportApi.summaryBlob(id)}
            documentLabel={`${investor.name} — Investor Summary`}
            customerPhone={investor.phone}
            customerEmail={investor.email}
          />
          <button className="btn-danger" onClick={() => setDeleteTarget(investor)}>
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {/* Clean Investor Financial Summary */}
      <section className="card p-5 space-y-5 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-gray-100 dark:border-gray-700/80 pb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Financial Summary</h2>
            <p className="text-xs text-gray-500">
              Clear breakdown of capital balances, profit share, and withdrawable funds
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('INVESTMENT_IN'); setShowTxModal(true); }}
            >
              + Add Capital
            </button>
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('RETURN_TO_INVESTOR'); setShowTxModal(true); }}
            >
              Return Capital
            </button>
            <button
              className="btn-secondary !text-xs !py-1.5"
              onClick={() => { setTxModalType('PROFIT_TO_CAPITAL'); setShowTxModal(true); }}
            >
              Reinvest Profit
            </button>
            <button
              className="btn-primary !text-xs !py-1.5"
              onClick={() => { setTxModalType('PROFIT_CASH_WITHDRAWAL'); setShowTxModal(true); }}
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
                Total Currently Available to Withdraw
              </p>
              <p className="text-2xl sm:text-3xl font-extrabold text-emerald-700 dark:text-emerald-400 mt-1">
                {formatCurrency((capital?.capitalAvailable || 0) + (profit?.investorRemainingProfit || 0))}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Strictly separated into available capital and available profit below
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
                  {formatCurrency(profit?.investorRemainingProfit || 0)}
                </span>
                <span className="text-[10px] text-gray-400 block">Realized 50% profit share</span>
              </div>
            </div>
          </div>
        </div>

        {/* Capital Breakdown */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
            Capital Breakdown
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Original Capital</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                {formatCurrency(capital?.originalCapitalInvested || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Additional Capital</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                {formatCurrency(capital?.additionalCapitalAdded || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Capital Returned</span>
              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5 block">
                {formatCurrency(capital?.totalCapitalReturned || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Capital Deployed</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                {formatCurrency(capital?.capitalDeployed || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Recovered Capital</span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(capital?.recoveredCapital || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Capital Still Deployed</span>
              <span className="text-sm font-semibold text-amber-600 dark:text-amber-400 mt-0.5 block">
                {formatCurrency(capital?.capitalStillDeployed || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium block">Current Available Capital</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(capital?.capitalAvailable || 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Profit Breakdown (50% Investor Share) */}
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2.5">
            Profit Breakdown (50% Investor Share)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Total Profit Earned</span>
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5 block">
                {formatCurrency(profit?.investorProfitShare || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Profit Withdrawn as Cash</span>
              <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 mt-0.5 block">
                {formatCurrency(profit?.investorProfitCashWithdrawn || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700">
              <span className="text-gray-500 block">Profit Transferred to Capital</span>
              <span className="text-sm font-semibold text-primary-600 dark:text-primary-400 mt-0.5 block">
                {formatCurrency(profit?.investorProfitToCapital || 0)}
              </span>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
              <span className="text-emerald-700 dark:text-emerald-300 font-medium block">Remaining Available Profit</span>
              <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400 mt-0.5 block">
                {formatCurrency(profit?.investorRemainingProfit || 0)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Operational stats cards */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="Capital Held" value={formatCurrency(capital.capitalHeld)} tone="good" />
        <SummaryCard label="Customers Funded" value={capital.customersFunded} />
        <SummaryCard label="Contracts Funded" value={capital.contractsFunded} />
        <SummaryCard label="Customer Collections" value={formatCurrency(capital.customerCollections)} tone="good" />
        <SummaryCard label="Outstanding" value={formatCurrency(capital.outstanding)} tone="bad" />
        <SummaryCard label="Paid Installments" value={installmentStats.PAID} tone="good" />
      </section>

      {/* Tabs */}
      <div className="flex gap-1 flex-wrap no-print">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap ${
              tab === t ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Overview' && <OverviewTab investor={investor} capital={capital} installmentStats={installmentStats} />}
      {tab === 'Transactions' && <TransactionsTab investorId={id} onChanged={load} />}
      {tab === 'Funded Customers' && <FundedCustomersTab investorId={id} />}
      {tab === 'Funded Contracts' && <FundedContractsTab investorId={id} />}
      {tab === 'Installments' && <InstallmentsTab investorId={id} />}
      {tab === 'Payments' && <PaymentsTab investorId={id} />}
      {tab === 'Outstanding' && <OutstandingTab investorId={id} />}
      {tab === 'Withdrawals' && <WithdrawalsTab investorId={id} />}
      {tab === 'Reports' && <ReportsTab investorId={id} />}

      {showTxModal && (
        <TransactionModal
          investor={investor}
          capital={capital}
          profit={profit}
          defaultType={txModalType}
          onClose={() => setShowTxModal(false)}
          onSuccess={() => {
            setShowTxModal(false);
            load();
          }}
        />
      )}

      {showWithdrawModal && (
        <WithdrawalModal
          investorId={id}
          onClose={() => setShowWithdrawModal(false)}
          onSuccess={() => {
            setShowWithdrawModal(false);
            load();
          }}
        />
      )}

      {deleteTarget && (
        <DeleteInvestorModal investor={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => navigate('/investors')} />
      )}
    </div>
  );
}

function SummaryCard({ label, value, tone = 'default' }) {
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

function OverviewTab({ investor, capital, installmentStats }) {
  return (
    <div className="card space-y-3">
      <h2 className="font-semibold text-sm text-gray-500">INVESTOR INFORMATION</h2>
      <div className="grid sm:grid-cols-2 gap-3 text-sm">
        <p><span className="text-gray-500">Phone:</span> {investor.phone}</p>
        {investor.whatsapp && <p><span className="text-gray-500">WhatsApp:</span> {investor.whatsapp}</p>}
        {investor.email && <p><span className="text-gray-500">Email:</span> {investor.email}</p>}
        {investor.cnic && <p><span className="text-gray-500">CNIC:</span> {investor.cnic}</p>}
        {investor.address && <p><span className="text-gray-500">Address:</span> {investor.address}</p>}
        {investor.notes && <p><span className="text-gray-500">Notes:</span> {investor.notes}</p>}
      </div>
      <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
        <h2 className="font-semibold text-sm text-gray-500 mb-2">PROFIT / LOSS (INFORMATIONAL — FROM FUNDED CONTRACTS)</h2>
        <p className="text-xs text-gray-400 mb-2">
          This reflects the product-level profit/loss on contracts this investor funded. It does not imply a
          profit-sharing arrangement — that is a business decision to be defined separately.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <p><span className="text-gray-500">Total Sale:</span> {formatCurrency(capital.totalSale)}</p>
          <p><span className="text-gray-500">Total Cost:</span> {formatCurrency(capital.totalCost)}</p>
          <p className="text-green-600"><span className="text-gray-500">Expected Profit:</span> {formatCurrency(capital.expectedProfit)}</p>
          <p className="text-red-600"><span className="text-gray-500">Expected Loss:</span> {formatCurrency(capital.expectedLoss)}</p>
        </div>
      </div>
    </div>
  );
}

function TransactionsTab({ investorId, onChanged }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    setLoading(true);
    investorApi
      .listTransactions(investorId, { page, limit: 20, ...dateFilter })
      .then((res) => {
        setTransactions(res.data.data);
        setPages(res.data.pages || 1);
      })
      .finally(() => setLoading(false));
  }, [investorId, page, dateFilter]);

  return (
    <div className="space-y-3">
      <DateFilterBar
        onChange={(f) => {
          setPage(1);
          setDateFilter(f);
        }}
      />
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Type</th>
            <th className="px-3 py-2 font-medium">Amount</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Notes</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>
          )}
          {!loading && transactions.length === 0 && (
            <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No transactions recorded yet.</td></tr>
          )}
          {!loading &&
            transactions.map((t) => (
              <tr key={t._id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(t.transactionDate)}</td>
                <td className="px-3 py-2">
                  <span
                    className={`badge ${
                      t.transactionType === 'INVESTMENT_IN'
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                        : t.transactionType === 'RETURN_TO_INVESTOR'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400'
                        : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    {t.transactionType.replace(/_/g, ' ')}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium">{formatCurrency(t.amount)}</td>
                <td className="px-3 py-2 hidden sm:table-cell text-gray-500">{t.notes || '-'}</td>
              </tr>
            ))}
        </tbody>
      </table>
      {pages > 1 && (
        <div className="flex justify-center gap-2 flex-wrap py-3">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)} className={`w-8 h-8 rounded-lg text-sm ${p === page ? 'bg-primary-600 text-white' : 'btn-secondary'}`}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
    </div>
  );
}

function FundedCustomersTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    investorApi
      .fundedCustomers(investorId, { page: 1, limit: 50 })
      .then((res) => setRows(res.data.data))
      .finally(() => setLoading(false));
  }, [investorId]);

  if (loading) return <p className="text-center text-gray-400 py-6">Loading...</p>;
  if (rows.length === 0) return <p className="text-center text-gray-400 py-6">No customers funded by this investor yet.</p>;

  return (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Phone</th>
            <th className="px-3 py-2 font-medium">Contracts Funded</th>
            <th className="px-3 py-2 font-medium">Deployed</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Collected</th>
            <th className="px-3 py-2 font-medium">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">
                <Link to={`/customers/${r.customer?._id}`} className="text-primary-600 font-medium">
                  {r.customer?.name}
                </Link>
              </td>
              <td className="px-3 py-2 hidden sm:table-cell">{r.customer?.contactNumber}</td>
              <td className="px-3 py-2">{r.contractsFunded}</td>
              <td className="px-3 py-2">{formatCurrency(r.deployed)}</td>
              <td className="px-3 py-2 hidden md:table-cell text-green-600">{formatCurrency(r.collected)}</td>
              <td className="px-3 py-2 text-orange-600">{formatCurrency(r.outstanding)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FundedContractsTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    const timer = setTimeout(() => {
      setLoading(true);
      investorApi
        .fundedContracts(investorId, { page: 1, limit: 50, search, ...dateFilter })
        .then((res) => setRows(res.data.data))
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [investorId, search, dateFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <input className="input max-w-xs" placeholder="Search contract, customer, product..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <DateFilterBar onChange={setDateFilter} />
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Contract</th>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">Product</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Sale Date</th>
              <th className="px-3 py-2 font-medium">Value</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Deployed</th>
              <th className="px-3 py-2 font-medium">Paid</th>
              <th className="px-3 py-2 font-medium">Outstanding</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">No contracts found.</td></tr>}
            {!loading &&
              rows.map((c) => (
                <tr key={c._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2 font-medium">{c.contractId}</td>
                  <td className="px-3 py-2">
                    <Link to={`/customers/${c.customerId?._id}`} className="text-primary-600">{c.customerId?.name}</Link>
                  </td>
                  <td className="px-3 py-2 hidden sm:table-cell">{c.productName}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{formatDate(c.startDate)}</td>
                  <td className="px-3 py-2">{formatCurrency(c.sellingPrice)}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{formatCurrency(c.capitalDeployed)}</td>
                  <td className="px-3 py-2 text-green-600">{formatCurrency(c.totalPaid)}</td>
                  <td className="px-3 py-2 text-orange-600">{formatCurrency(c.remainingAmount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={c.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InstallmentsTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    setLoading(true);
    investorApi
      .installments(investorId, { page: 1, limit: 100, status: status || undefined, ...dateFilter })
      .then((res) => setRows(res.data.data))
      .finally(() => setLoading(false));
  }, [investorId, status, dateFilter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3 items-center">
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PAID">Paid</option>
          <option value="PARTIAL">Partial</option>
          <option value="PENDING">Pending</option>
          <option value="OVERDUE">Overdue</option>
          <option value="MISSED">Missed</option>
        </select>
        <DateFilterBar onChange={setDateFilter} />
      </div>
      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Customer</th>
              <th className="px-3 py-2 font-medium hidden sm:table-cell">Product</th>
              <th className="px-3 py-2 font-medium">No.</th>
              <th className="px-3 py-2 font-medium">Due Date</th>
              <th className="px-3 py-2 font-medium">Expected</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Paid</th>
              <th className="px-3 py-2 font-medium hidden md:table-cell">Remaining</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Loading...</td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">No installments found.</td></tr>}
            {!loading &&
              rows.map((i) => (
                <tr key={i._id} className="border-t border-gray-100 dark:border-gray-800">
                  <td className="px-3 py-2">{i.customerId?.name}</td>
                  <td className="px-3 py-2 hidden sm:table-cell">{i.planId?.productName}</td>
                  <td className="px-3 py-2">#{i.installmentNumber}</td>
                  <td className="px-3 py-2">{formatDate(i.dueDate)}</td>
                  <td className="px-3 py-2">{formatCurrency(i.amountDue)}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{formatCurrency(i.paidAmount)}</td>
                  <td className="px-3 py-2 hidden md:table-cell">{formatCurrency(i.amountDue - i.paidAmount)}</td>
                  <td className="px-3 py-2"><StatusBadge status={i.status} /></td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PaymentsTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    setLoading(true);
    investorApi
      .payments(investorId, { page: 1, limit: 100, ...dateFilter })
      .then((res) => setRows(res.data.data))
      .finally(() => setLoading(false));
  }, [investorId, dateFilter]);

  return (
    <div className="space-y-3">
      <DateFilterBar onChange={setDateFilter} />
      {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
      {!loading && rows.length === 0 && <p className="text-center text-gray-400 py-6">No payments recorded on this investor's contracts yet.</p>}
      {!loading && rows.length > 0 && (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Installment</th>
            <th className="px-3 py-2 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2">{formatDate(p.paymentDate)}</td>
              <td className="px-3 py-2">{p.customerId?.name}</td>
              <td className="px-3 py-2 hidden sm:table-cell">#{p.installmentId?.installmentNumber}</td>
              <td className="px-3 py-2 text-green-600 font-medium">{formatCurrency(p.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
    </div>
  );
}

function OutstandingTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState({ preset: 'all' });

  useEffect(() => {
    setLoading(true);
    investorApi
      .fundedContracts(investorId, { page: 1, limit: 200, ...dateFilter })
      .then((res) => setRows(res.data.data.filter((c) => c.remainingAmount > 0)))
      .finally(() => setLoading(false));
  }, [investorId, dateFilter]);

  return (
    <div className="space-y-3">
      <DateFilterBar onChange={setDateFilter} />
      {loading && <p className="text-center text-gray-400 py-6">Loading...</p>}
      {!loading && rows.length === 0 && <p className="text-center text-gray-400 py-6">No outstanding balance on this investor's contracts.</p>}
      {!loading && rows.length > 0 && (
    <div className="card p-0 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Contract</th>
            <th className="px-3 py-2 font-medium">Customer</th>
            <th className="px-3 py-2 font-medium hidden sm:table-cell">Product</th>
            <th className="px-3 py-2 font-medium hidden md:table-cell">Deployed</th>
            <th className="px-3 py-2 font-medium">Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c._id} className="border-t border-gray-100 dark:border-gray-800">
              <td className="px-3 py-2 font-medium">{c.contractId}</td>
              <td className="px-3 py-2">
                <Link to={`/customers/${c.customerId?._id}`} className="text-primary-600">{c.customerId?.name}</Link>
              </td>
              <td className="px-3 py-2 hidden sm:table-cell">{c.productName}</td>
              <td className="px-3 py-2 hidden md:table-cell">{formatCurrency(c.capitalDeployed)}</td>
              <td className="px-3 py-2 text-orange-600 font-medium">{formatCurrency(c.remainingAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
      )}
    </div>
  );
}

function WithdrawalsTab({ investorId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    investorApi
      .withdrawals(investorId, { page: 1, limit: 100 })
      .then((res) => setRows(res.data.data))
      .finally(() => setLoading(false));
  }, [investorId]);

  if (loading) return <p className="text-center text-gray-400 py-6">Loading...</p>;
  if (rows.length === 0) return <p className="text-center text-gray-400 py-6">No withdrawals recorded for this investor yet.</p>;

  return (
    <>
      <div className="card p-0 overflow-x-auto hidden sm:block">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Total</th>
              <th className="px-3 py-2 font-medium">Owner Share</th>
              <th className="px-3 py-2 font-medium">Investor Share</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w._id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-3 py-2">{formatDate(w.withdrawalDate)}</td>
                <td className="px-3 py-2 font-medium">{formatCurrency(w.totalAmount)}</td>
                <td className="px-3 py-2">{formatCurrency(w.ownerAmount)}</td>
                <td className="px-3 py-2">{formatCurrency(w.investorAmount)}</td>
                <td className="px-3 py-2 text-gray-500">{w.reference || '-'}</td>
                <td className="px-3 py-2 text-gray-500">{w.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-3 sm:hidden">
        {rows.map((w) => (
          <div key={w._id} className="card">
            <div className="flex justify-between items-center mb-2">
              <p className="font-medium">{formatDate(w.withdrawalDate)}</p>
              <p className="font-semibold">{formatCurrency(w.totalAmount)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
              <p>Owner: {formatCurrency(w.ownerAmount)}</p>
              <p>Investor: {formatCurrency(w.investorAmount)}</p>
            </div>
            {w.notes && <p className="text-xs text-gray-400 mt-2">{w.notes}</p>}
          </div>
        ))}
      </div>
    </>
  );
}

function ReportsTab({ investorId }) {
  const reports = [
    { label: 'Investor Summary', pdf: 'summaryPdf', excel: 'summaryExcel' },
    { label: 'Investment Transactions', pdf: 'transactionsPdf', excel: 'transactionsExcel' },
    { label: 'Funded Customers', pdf: 'fundedCustomersPdf', excel: 'customersExcel' },
    { label: 'Funded Contracts', pdf: null, excel: 'contractsExcel' },
    { label: 'Installment History', pdf: 'installmentsPdf', excel: 'installmentsExcel' },
    { label: 'Outstanding', pdf: 'outstandingPdf', excel: 'outstandingExcel' },
    { label: 'Full History', pdf: 'fullHistoryPdf', excel: null },
  ];

  return (
    <div className="card divide-y divide-gray-100 dark:divide-gray-800">
      {reports.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-3 flex-wrap gap-2">
          <span className="text-sm font-medium">{r.label}</span>
          <div className="flex gap-2">
            {r.pdf && (
              <button
                className="btn-secondary !text-xs !px-3 !py-1.5"
                onClick={() => investorExportApi[r.pdf](investorId).catch(() => toast.error('Failed to open PDF.'))}
              >
                PDF
              </button>
            )}
            {r.excel && (
              <button
                className="btn-secondary !text-xs !px-3 !py-1.5"
                onClick={() => investorExportApi[r.excel](investorId).catch(() => toast.error('Failed to export Excel.'))}
              >
                Excel
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AddTransactionModal({ investorId, onClose, onSuccess }) {
  const [transactionType, setTransactionType] = useState('INVESTMENT_IN');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!amount || Number(amount) <= 0) {
      toast.error('Enter a valid amount.');
      return;
    }
    setSaving(true);
    try {
      await investorApi.addTransaction(investorId, { transactionType, amount: Number(amount), transactionDate, notes });
      toast.success('Transaction recorded.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Add Investor Transaction</h3>
        <div className="space-y-3">
          <div>
            <label className="label">Transaction Type</label>
            <select className="input" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
              <option value="INVESTMENT_IN">Investment In</option>
              <option value="RETURN_TO_INVESTOR">Return to Investor</option>
              <option value="ADJUSTMENT">Adjustment</option>
            </select>
          </div>
          <div>
            <label className="label">Amount</label>
            <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 flex-wrap mt-5">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Save Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}
