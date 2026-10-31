import { useEffect, useState, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Printer, Edit, Archive, Trash2, FileDown, WifiOff } from 'lucide-react';
import { customerApi, planApi, exportApi } from '../api/services';
import { formatCurrency, formatDate } from '../utils/format';
import StatusBadge from '../components/common/StatusBadge';
import InstallmentTable from '../components/installments/InstallmentTable';
import RecordPaymentModal from '../components/payments/RecordPaymentModal';
import DeleteCustomerModal from '../components/customers/DeleteCustomerModal';
import ShareMenu from '../components/common/ShareMenu';
import DateFilterBar from '../components/common/DateFilterBar';
import FundingAllocationEditor from '../components/investors/FundingAllocationEditor';
import { DURATION_OPTIONS } from '../utils/durationOptions';
import { get, getAll } from '../offline/db';

const TABS = ['Overview', 'Installments', 'Payments', 'Missed', 'Profit/Loss'];

export default function CustomerDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [activePlanId, setActivePlanId] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [profitDistribution, setProfitDistribution] = useState(null);
  const [tab, setTab] = useState('Overview');
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [durationEdit, setDurationEdit] = useState(false);
  const [monthlyEdit, setMonthlyEdit] = useState(false);
  const [fundingEdit, setFundingEdit] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [scheduleDateFilter, setScheduleDateFilter] = useState({ preset: 'all' });
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const loadOfflineSchedule = useCallback(async (pid) => {
    try {
      const all = await getAll('installments');
      const filtered = all
        .filter((i) => i.planId === pid || i.planId?._id === pid)
        .sort((a, b) => (a.installmentNumber || 0) - (b.installmentNumber || 0));
      setSchedule(filtered);
    } catch {
      // Ignored
    }
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await customerApi.get(id);
      setCustomer(res.data.data.customer);
      setPlans(res.data.data.plans);
      setSummary(res.data.data.summary);
      if (res.data.data.plans.length > 0) {
        const pid = activePlanId || res.data.data.plans[0]._id;
        setActivePlanId(pid);
      }
      setIsOfflineMode(false);
    } catch {
      // Offline fallback: load from IndexedDB
      const [cachedCust, allPlans] = await Promise.all([
        get('customers', id),
        getAll('installmentPlans'),
      ]);

      if (cachedCust) {
        setCustomer(cachedCust);
        const customerPlans = allPlans.filter(
          (p) => p.customerId === id || p.customerId?._id === id
        );
        setPlans(customerPlans);
        if (customerPlans.length > 0) {
          const pid = activePlanId || customerPlans[0]._id;
          setActivePlanId(pid);
          await loadOfflineSchedule(pid);
        }
        setIsOfflineMode(true);
      } else {
        toast.error('Customer not found in local cache.');
      }
    }
  }, [id, activePlanId, loadOfflineSchedule]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (!activePlanId) return;
    if (navigator.onLine) {
      planApi
        .get(activePlanId)
        .then((res) => {
          setSchedule(res.data.data.schedule);
          setProfitDistribution(res.data.data.profitDistribution || null);
        })
        .catch(() => loadOfflineSchedule(activePlanId));
    } else {
      loadOfflineSchedule(activePlanId);
    }
  }, [activePlanId, loadOfflineSchedule]);

  async function refreshPlan() {
    if (!activePlanId) return;
    if (navigator.onLine) {
      try {
        const res = await planApi.get(activePlanId);
        setSchedule(res.data.data.schedule);
        setProfitDistribution(res.data.data.profitDistribution || null);
        setPlans((prev) => prev.map((p) => (p._id === activePlanId ? res.data.data.plan : p)));
        return;
      } catch {
        // Fall through
      }
    }
    await loadOfflineSchedule(activePlanId);
  }

  async function handleArchive() {
    if (!confirm('Archive this customer?')) return;
    try {
      await customerApi.archive(id);
      toast.success('Customer archived.');
      navigate('/customers');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to archive.');
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!customer) return <div className="p-8 text-center text-gray-400">Customer not found.</div>;

  const activePlan = plans.find((p) => p._id === activePlanId);
  const paidCount = schedule.filter((s) => s.status === 'PAID').length;
  const partialCount = schedule.filter((s) => s.status === 'PARTIAL').length;
  const missedCount = schedule.filter((s) => s.status === 'MISSED').length;
  const pendingCount = schedule.filter((s) => s.status === 'PENDING').length;
  const overdueCount = schedule.filter((s) => s.status === 'OVERDUE').length;
  const missedAmount = schedule.filter((s) => s.status === 'MISSED').reduce((sum, s) => sum + (s.amountDue - s.paidAmount), 0);
  const overdueAmount = schedule.filter((s) => s.status === 'OVERDUE').reduce((sum, s) => sum + (s.amountDue - s.paidAmount), 0);
  const nextDue = schedule.find((s) => ['PENDING', 'OVERDUE'].includes(s.status));

  // The contract's schedule is a small, already-fetched dataset (at most a few dozen
  // rows per contract), so filtering it client-side by the selected date range here is
  // fine — this is not the "load everything into React" case the server-side rule
  // guards against. Summary counts above stay lifetime-scoped regardless of this filter.
  function withinDateFilter(dateValue) {
    if (!dateValue || scheduleDateFilter.preset === 'all') return true;
    const d = new Date(dateValue);
    const now = new Date();
    const startOfDay = (date) => { const x = new Date(date); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (date) => { const x = new Date(date); x.setHours(23, 59, 59, 999); return x; };
    const today = startOfDay(now);
    switch (scheduleDateFilter.preset) {
      case 'today':
        return d >= today && d <= endOfDay(now);
      case 'yesterday': {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        return d >= y && d <= endOfDay(y);
      }
      case 'this_week': {
        const start = new Date(today); start.setDate(start.getDate() - start.getDay());
        return d >= start && d <= endOfDay(now);
      }
      case 'last_week': {
        const thisWeekStart = new Date(today); thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
        const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
        const lastWeekEnd = new Date(thisWeekStart); lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
        return d >= lastWeekStart && d <= endOfDay(lastWeekEnd);
      }
      case 'this_month': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        return d >= start && d <= endOfDay(now);
      }
      case 'last_month': {
        const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const end = new Date(now.getFullYear(), now.getMonth(), 0);
        return d >= start && d <= endOfDay(end);
      }
      case 'custom': {
        if (!scheduleDateFilter.from || !scheduleDateFilter.to) return true;
        return d >= startOfDay(new Date(scheduleDateFilter.from)) && d <= endOfDay(new Date(scheduleDateFilter.to));
      }
      default:
        return true;
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3 no-print">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {customer.name}
            {isOfflineMode && (
              <span className="badge bg-amber-500/10 text-amber-600 text-xs font-normal flex items-center gap-1">
                <WifiOff className="w-3.5 h-3.5" /> Offline Mode
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">
            {customer.customerId} · {customer.contactNumber} {customer.address && `· ${customer.address}`}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link to={`/customers/${id}/edit`} className="btn-secondary">
            <Edit className="w-4 h-4" /> <span className="hidden sm:inline">Edit</span>
          </Link>
          <button className="btn-secondary" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> <span className="hidden sm:inline">Print</span>
          </button>
          <button
            className="btn-secondary"
            onClick={() => exportApi.customerFullRecordPdf(id).catch(() => toast.error('Failed to open full record.'))}
          >
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Print Full Record</span>
          </button>
          {activePlanId && (
            <button className="btn-secondary" onClick={() => exportApi.installmentSheetPdf(activePlanId).catch(() => toast.error('Failed to export installment sheet.'))}>
              <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Installment Sheet PDF</span>
            </button>
          )}
          <button className="btn-secondary" onClick={() => exportApi.customerLedgerPdf(id).catch(() => toast.error('Failed to export ledger.'))}>
            <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Ledger PDF</span>
          </button>
          <ShareMenu
            getBlob={() => exportApi.customerFullRecordBlob(id)}
            documentLabel={`${customer.name} — Full Record`}
            customerPhone={customer.contactNumber}
            customerEmail={customer.email}
          />
          <button className="btn-danger" onClick={handleArchive}>
            <Archive className="w-4 h-4" /> <span className="hidden sm:inline">Archive</span>
          </button>
          <button className="btn-danger" onClick={() => setDeleteTarget(customer)}>
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {deleteTarget && (
        <DeleteCustomerModal customer={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={() => navigate('/customers')} />
      )}

      {summary && (
        <section className="card">
          <h2 className="font-semibold text-sm text-gray-500 mb-3">CUSTOMER SUMMARY</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-center">
            <MiniStat label="Products" value={summary.totalContracts} />
            <MiniStat label="Completed" value={summary.completedContracts} tone="good" />
            <MiniStat label="Running" value={summary.runningContracts} />
            <MiniStat label="Cancelled" value={summary.cancelledContracts} />
            <MiniStat label="Total Sale" value={formatCurrency(summary.totalSale)} />
            <MiniStat label="Total Paid" value={formatCurrency(summary.totalPaid)} tone="good" />
            <MiniStat label="Remaining" value={formatCurrency(summary.totalRemaining)} tone="warn" />
            <MiniStat
              label={summary.totalExpectedLoss > 0 ? 'Total Loss' : 'Total Profit'}
              value={formatCurrency(summary.totalExpectedLoss > 0 ? summary.totalExpectedLoss : summary.totalExpectedProfit)}
              tone={summary.totalExpectedLoss > 0 ? 'bad' : 'good'}
            />
          </div>
        </section>
      )}

      {plans.length > 0 && (
        <section className="no-print">
          <h2 className="font-semibold text-sm text-gray-500 mb-2">ALL PRODUCTS / CONTRACTS</h2>
          <div className="flex gap-2 flex-wrap">
            {plans.map((p) => (
              <button
                key={p._id}
                onClick={() => setActivePlanId(p._id)}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 ${p._id === activePlanId ? 'bg-primary-600 text-white' : 'btn-secondary'}`}
              >
                <span>{p.contractId} — {p.productName}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    p._id === activePlanId ? 'bg-white/20' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                  }`}
                >
                  {p.fundingSource === 'INVESTOR' ? p.investorId?.name || 'Investor' : 'Business'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {!activePlan && (
        <div className="card text-center py-8">
          <p className="text-gray-500 mb-3">This customer has no installment contract yet.</p>
          <Link to={`/customers/${id}/new-plan`} className="btn-primary inline-flex">
            Create Installment Contract
          </Link>
        </div>
      )}

      {activePlan && (
        <>
          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard label="Purchase Cost" value={formatCurrency(activePlan.purchaseCost)} />
            <InfoCard label="Selling Price" value={formatCurrency(activePlan.sellingPrice)} />
            <InfoCard label="Down Payment" value={formatCurrency(activePlan.downPayment)} />
            <InfoCard label="Total Paid" value={formatCurrency(activePlan.totalPaid)} tone="good" />
            <InfoCard label="Remaining" value={formatCurrency(activePlan.remainingAmount)} tone="warn" />
            <InfoCard label="Monthly Installment" value={formatCurrency(activePlan.monthlyInstallment)} />
            <InfoCard label="Duration" value={`${activePlan.installmentDurationMonths} months`} />
            <InfoCard label="Status" value={<StatusBadge status={activePlan.status} />} />
            <InfoCard
              label="Funding Source"
              value={activePlan.fundingSource === 'INVESTOR' ? `Investor — ${activePlan.investorId?.name || ''}` : 'Business'}
            />
            {activePlan.fundingSource === 'INVESTOR' && (
              <InfoCard label="Capital Deployed" value={formatCurrency(activePlan.capitalDeployed)} tone="warn" />
            )}
            <InfoCard
              label={activePlan.expectedLoss > 0 ? 'Expected Loss' : 'Expected Profit'}
              value={formatCurrency(activePlan.expectedLoss > 0 ? activePlan.expectedLoss : activePlan.expectedProfit)}
              tone={activePlan.expectedLoss > 0 ? 'bad' : 'good'}
            />
            <InfoCard label="Profit Margin" value={`${(activePlan.profitMargin || 0).toFixed(2)}%`} />
            <InfoCard label="Missed Amount" value={formatCurrency(missedAmount)} tone="bad" />
            <InfoCard label="Overdue Amount" value={formatCurrency(overdueAmount)} tone="bad" />
          </section>

          <div className="flex items-center justify-between flex-wrap gap-2 no-print">
            <div className="flex gap-1">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg ${tab === t ? 'bg-primary-600 text-white' : 'text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary !text-xs" onClick={() => setDurationEdit(true)}>
                Change Duration
              </button>
              <button className="btn-secondary !text-xs" onClick={() => setMonthlyEdit(true)}>
                Change Monthly Amount
              </button>
              <button className="btn-secondary !text-xs" onClick={() => setFundingEdit(true)}>
                Edit Funding Allocation
              </button>
            </div>
          </div>

          {tab === 'Overview' && (
            <div className="card">
              <h2 className="font-semibold text-sm text-gray-500 mb-3">CONTRACT INFORMATION</h2>
              <div className="grid sm:grid-cols-2 gap-3 text-sm">
                <p><span className="text-gray-500">Product:</span> {activePlan.productName}</p>
                <p><span className="text-gray-500">Description:</span> {activePlan.productDescription || '-'}</p>
                <p><span className="text-gray-500">Start Date:</span> {formatDate(activePlan.startDate)}</p>
                <p><span className="text-gray-500">First Due Date:</span> {formatDate(activePlan.firstDueDate)}</p>
                <p><span className="text-gray-500">Next Due:</span> {nextDue ? `#${nextDue.installmentNumber} — ${formatDate(nextDue.dueDate)}` : 'All settled'}</p>
                <p><span className="text-gray-500">Notes:</span> {activePlan.notes || '-'}</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4 text-center">
                <MiniStat label="Paid" value={paidCount} tone="good" />
                <MiniStat label="Partial" value={partialCount} tone="warn" />
                <MiniStat label="Pending" value={pendingCount} />
                <MiniStat label="Missed" value={missedCount} tone="bad" />
                <MiniStat label="Overdue" value={overdueCount} tone="bad" />
              </div>
            </div>
          )}

          {tab === 'Installments' && (
            <div className="card space-y-3">
              <DateFilterBar onChange={setScheduleDateFilter} />
              <InstallmentTable schedule={schedule.filter((s) => withinDateFilter(s.dueDate))} onRecordPayment={setPaymentTarget} />
            </div>
          )}

          {tab === 'Payments' && (
            <div className="card space-y-3">
              <DateFilterBar onChange={setScheduleDateFilter} />
              <InstallmentTable
                schedule={schedule.filter((s) => s.paidAmount > 0 && withinDateFilter(s.paymentDate))}
                onRecordPayment={setPaymentTarget}
              />
              {schedule.filter((s) => s.paidAmount > 0 && withinDateFilter(s.paymentDate)).length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No payments recorded in this period.</p>
              )}
            </div>
          )}

          {tab === 'Missed' && (
            <div className="card space-y-3">
              <DateFilterBar onChange={setScheduleDateFilter} />
              <InstallmentTable
                schedule={schedule.filter((s) => s.status === 'MISSED' && withinDateFilter(s.dueDate))}
                onRecordPayment={setPaymentTarget}
              />
              {schedule.filter((s) => s.status === 'MISSED' && withinDateFilter(s.dueDate)).length === 0 && (
                <p className="text-sm text-gray-400 py-4 text-center">No missed installments in this period.</p>
              )}
            </div>
          )}

          {tab === 'Profit/Loss' && (
            <div className="space-y-4">
              <div className="card grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <InfoCard label="Purchase Cost" value={formatCurrency(activePlan.purchaseCost)} />
                <InfoCard label="Selling Price" value={formatCurrency(activePlan.sellingPrice)} />
                <InfoCard label="Expected Profit" value={formatCurrency(activePlan.expectedProfit)} tone="good" />
                <InfoCard label="Profit Margin" value={`${(activePlan.profitMargin || 0).toFixed(2)}%`} />
                <InfoCard label="Down Payment" value={formatCurrency(activePlan.downPayment)} />
                <InfoCard label="Total Installments Paid" value={formatCurrency(activePlan.totalPaid)} tone="good" />
                <InfoCard label="Total Collected" value={formatCurrency((activePlan.totalPaid || 0) + (activePlan.downPayment || 0))} tone="good" />
                <InfoCard label="Remaining Receivable" value={formatCurrency(activePlan.remainingAmount)} tone="warn" />
              </div>

              {profitDistribution ? (
                <div className="card space-y-4">
                  <div className="border-b border-gray-100 dark:border-gray-800 pb-3">
                    <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">
                      REALIZED PROFIT DISTRIBUTION (50% OWNER / 50% INVESTORS)
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      Method: Profit-First Cash Allocation. Profit is recognized immediately from initial collections
                      (down payment and early installments) up to total expected profit, then split 50% Owner and 50% Investors.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    <InfoCard label="Total Realized Profit" value={formatCurrency(profitDistribution.realizedProfit)} tone="good" />
                    <InfoCard label="Owner 50% Profit Share" value={formatCurrency(profitDistribution.ownerProfit)} tone="good" />
                    <InfoCard label="Investors 50% Pool" value={formatCurrency(profitDistribution.investorProfitPool)} tone="good" />
                    <InfoCard label="Recovered Capital" value={formatCurrency(profitDistribution.recoveredCapital || 0)} tone="good" />
                    <InfoCard label="Capital Still Deployed" value={formatCurrency(profitDistribution.capitalStillDeployed != null ? profitDistribution.capitalStillDeployed : activePlan.purchaseCost)} tone="warn" />
                  </div>

                  {profitDistribution.investorShares?.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-gray-800 text-gray-500 text-left">
                          <tr>
                            <th className="px-3 py-2 font-medium">Investor</th>
                            <th className="px-3 py-2 font-medium">Funded Amount</th>
                            <th className="px-3 py-2 font-medium">Funding Share</th>
                            <th className="px-3 py-2 font-medium">Recovered Capital</th>
                            <th className="px-3 py-2 font-medium">Still Deployed</th>
                            <th className="px-3 py-2 font-medium">Realized Profit Share</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitDistribution.investorShares.map((s, idx) => (
                            <tr key={idx} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="px-3 py-2 font-medium">
                                {s.investorId?.name || 'Investor'} {s.investorId?.investorId ? `(${s.investorId.investorId})` : ''}
                              </td>
                              <td className="px-3 py-2">{formatCurrency(s.fundedAmount)}</td>
                              <td className="px-3 py-2">{s.fundedSharePercent}%</td>
                              <td className="px-3 py-2 font-medium text-green-600">{formatCurrency(s.recoveredCapital || 0)}</td>
                              <td className="px-3 py-2 text-orange-600">{formatCurrency(s.capitalStillDeployed != null ? s.capitalStillDeployed : s.fundedAmount)}</td>
                              <td className="px-3 py-2 font-semibold text-green-600">{formatCurrency(s.profitShare)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="card text-center py-6 text-gray-500 text-sm">
                  {activePlan.fundingSource === 'BUSINESS'
                    ? 'This contract is funded entirely by Business/Own Funds. 100% of realized profit belongs to Business.'
                    : 'No realized profit distribution recorded yet. It will calculate as payments/down payment are recorded.'}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {paymentTarget && (
        <RecordPaymentModal
          installment={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSuccess={() => {
            setPaymentTarget(null);
            refreshPlan();
          }}
        />
      )}

      {durationEdit && activePlan && (
        <DurationEditModal plan={activePlan} onClose={() => setDurationEdit(false)} onSuccess={() => { setDurationEdit(false); refreshPlan(); }} />
      )}
      {monthlyEdit && activePlan && (
        <MonthlyEditModal plan={activePlan} onClose={() => setMonthlyEdit(false)} onSuccess={() => { setMonthlyEdit(false); refreshPlan(); }} />
      )}
      {fundingEdit && activePlan && (
        <FundingAllocationModal
          plan={activePlan}
          onClose={() => setFundingEdit(false)}
          onSaved={() => { setFundingEdit(false); refreshPlan(); }}
        />
      )}
    </div>
  );
}

function InfoCard({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-gray-900 dark:text-gray-100',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-orange-600 dark:text-orange-400',
  };
  return (
    <div className="card">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`font-semibold ${tones[tone]}`}>{value}</p>
    </div>
  );
}

function MiniStat({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-gray-900 dark:text-gray-100',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-orange-600 dark:text-orange-400',
  };
  return (
    <div>
      <p className={`text-lg font-bold ${tones[tone]}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function DurationEditModal({ plan, onClose, onSuccess }) {
  const [durationChoice, setDurationChoice] = useState(String(plan.installmentDurationMonths));
  const [custom, setCustom] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const newDuration = durationChoice === 'custom' ? Number(custom) : Number(durationChoice);
    if (!newDuration) return;
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSaving(true);
    try {
      await planApi.changeDuration(plan._id, newDuration, true);
      toast.success('Duration updated.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update duration.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Change Installment Duration</h3>
        {!confirmStep ? (
          <>
            <label className="label">New Duration</label>
            <select className="input mb-3" value={durationChoice} onChange={(e) => setDurationChoice(e.target.value)}>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} Months
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            {durationChoice === 'custom' && (
              <input type="number" className="input mb-3" placeholder="Enter months" value={custom} onChange={(e) => setCustom(e.target.value)} />
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            You are changing the installment duration. Existing payment history will remain unchanged. Future unpaid installments will be recalculated.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : confirmStep ? 'Confirm' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MonthlyEditModal({ plan, onClose, onSuccess }) {
  const [amount, setAmount] = useState(String(plan.monthlyInstallment));
  const [confirmStep, setConfirmStep] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    const newAmount = Number(amount);
    if (!newAmount || newAmount <= 0) return;
    if (!confirmStep) {
      setConfirmStep(true);
      return;
    }
    setSaving(true);
    try {
      await planApi.changeMonthly(plan._id, newAmount, true);
      toast.success('Monthly installment updated.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Change Monthly Installment</h3>
        {!confirmStep ? (
          <>
            <label className="label">New Monthly Installment</label>
            <input type="number" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">This will change future installment amounts. Existing payment history remains unchanged.</p>
        )}
        <div className="flex justify-end gap-3 mt-4">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : confirmStep ? 'Confirm' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FundingAllocationModal({ plan, onClose, onSaved }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Funding Allocation — {plan.contractId}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        <FundingAllocationEditor planId={plan._id} requiredCapital={plan.purchaseCost} onSaved={onSaved} />
      </div>
    </div>
  );
}
