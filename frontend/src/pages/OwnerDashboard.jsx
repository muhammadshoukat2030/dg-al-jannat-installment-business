import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { PlusCircle, Wallet } from 'lucide-react';
import { ownerApi, investorApi, withdrawalApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import WithdrawalModal from '../components/investors/WithdrawalModal';

export default function OwnerDashboard() {
  const [profit, setProfit] = useState(null);
  const [capital, setCapital] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showAddCapital, setShowAddCapital] = useState(false);

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
          <button className="btn-secondary" onClick={() => setShowAddCapital(true)}>
            <Wallet className="w-4 h-4" /> <span className="hidden sm:inline">Add / Return Capital</span>
          </button>
          <button className="btn-primary" onClick={() => setShowWithdraw(true)}>
            <PlusCircle className="w-4 h-4" /> <span className="hidden sm:inline">Record Withdrawal</span>
          </button>
        </div>
      </div>

      {capital && (
        <section>
          <h2 className="font-semibold text-sm text-gray-500 mb-2">OWNER CAPITAL</h2>
          <p className="text-xs text-gray-400 mb-3">
            The Owner's own invested capital — completely separate from profit below and from
            any investor's capital. This must be added here before it can be used to fund a
            contract; a contract can never be funded by Owner capital that doesn't exist.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card label="Total Capital Added" value={formatCurrency(capital.totalCapitalAdded)} />
            <Card label="Capital Returned" value={formatCurrency(capital.totalCapitalReturned)} tone="warn" />
            <Card label="Capital Held" value={formatCurrency(capital.capitalHeld)} tone="good" />
            <Card label="Capital Deployed" value={formatCurrency(capital.capitalDeployed)} tone="warn" />
            <Card label="Recovered Capital" value={formatCurrency(capital.recoveredCapital || 0)} tone="good" />
            <Card label="Capital Still Deployed" value={formatCurrency(capital.capitalStillDeployed != null ? capital.capitalStillDeployed : capital.capitalDeployed)} tone="warn" />
            <Card label="Profit Reinvested" value={formatCurrency(capital.profitTransferredToCapital || 0)} tone="good" />
            <Card label="Capital Available" value={formatCurrency(capital.capitalAvailable)} tone="good" />
          </div>
        </section>
      )}

      <p className="text-xs text-gray-400 -mt-3">
        This tracks the Owner's 50% profit share earned from investor-funded contracts —
        separate from investor capital and separate from overall business sales/profit
        shown on the main Dashboard.
      </p>

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card label="Total Owner Profit" value={formatCurrency(profit.totalOwnerProfit)} tone="good" />
        <Card label="Owner Profit Withdrawn" value={formatCurrency(profit.totalOwnerWithdrawn)} tone="warn" />
        <Card label="Owner Profit Remaining" value={formatCurrency(profit.totalOwnerRemaining)} tone="good" />
        <Card label="Investors Contributing" value={profit.perInvestor.length} />
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
        <AddCapitalModal
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

function AddCapitalModal({ onClose, onSuccess }) {
  const [transactionType, setTransactionType] = useState('CAPITAL_IN');
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
      await ownerApi.addCapitalTransaction({ transactionType, amount: Number(amount), transactionDate, notes });
      toast.success('Capital transaction recorded.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record capital transaction.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Add / Return Owner Capital</h3>
        <p className="text-xs text-gray-400 mb-3">
          This is separate from a profit withdrawal — it changes the Owner's own invested
          capital, not their profit share.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Transaction Type</label>
            <select className="input" value={transactionType} onChange={(e) => setTransactionType(e.target.value)}>
              <option value="CAPITAL_IN">Add Capital</option>
              <option value="CAPITAL_RETURNED">Return Capital</option>
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
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, tone = 'default' }) {
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
