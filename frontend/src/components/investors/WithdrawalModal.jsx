import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { investorApi, withdrawalApi } from '../../api/services';
import { formatCurrency } from '../../utils/format';
import { queryInvestorsOffline, put, enqueueOperation } from '../../offline/db';
import { refreshPendingCount } from '../../offline/syncManager';

/**
 * Withdrawal entry form. The Owner/Investor split is ALWAYS exactly 50/50 and is
 * only ever shown as a computed, non-editable preview — the real enforcement (and
 * the "does the investor have enough remaining profit" check) happens server-side
 * in accountingService.processWithdrawal. This form can never submit an unequal
 * split even if a bug slipped past validation here.
 */
export default function WithdrawalModal({ investorId: fixedInvestorId, onClose, onSuccess }) {
  const [investors, setInvestors] = useState([]);
  const [investorId, setInvestorId] = useState(fixedInvestorId || '');
  const [profile, setProfile] = useState(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (fixedInvestorId) return;
    queryInvestorsOffline({ limit: 100 }).then((local) => {
      if (local && local.data.length > 0) setInvestors(local.data);
    }).catch(() => {});
    investorApi.list({ status: 'active', limit: 100 }).then((res) => setInvestors(res.data.data)).catch(() => {});
  }, [fixedInvestorId]);

  useEffect(() => {
    if (!investorId) {
      setProfile(null);
      return;
    }
    investorApi.profit(investorId).then((res) => setProfile(res.data.data)).catch(() => {});
  }, [investorId]);

  const total = Number(totalAmount) || 0;
  const investorShare = Math.round((total / 2) * 100) / 100;
  const ownerShare = Math.round((total - investorShare) * 100) / 100;
  const exceedsRemaining = profile && investorShare > profile.investorRemainingProfit;

  async function submit() {
    if (!investorId) {
      toast.error('Please select an investor.');
      return;
    }
    if (!(total > 0)) {
      toast.error('Enter a valid withdrawal amount.');
      return;
    }
    setSaving(true);
    try {
      if (!navigator.onLine) {
        const operationId = 'op_with_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const localWithdrawal = {
          _id: 'local_' + operationId,
          investorId,
          totalAmount: total,
          ownerAmount: ownerShare,
          investorAmount: investorShare,
          withdrawalDate: withdrawalDate || new Date().toISOString(),
          reference: reference || '',
          notes: notes || '',
          status: 'COMPLETED',
          operationId,
        };
        await put('withdrawals', localWithdrawal);
        await enqueueOperation({
          operationId,
          type: 'RECORD_WITHDRAWAL',
          payload: { investorId, totalAmount: total, withdrawalDate, reference, notes },
        });
        await refreshPendingCount();
        toast.success('Withdrawal saved offline. Will sync automatically when online.');
        onSuccess();
        return;
      }

      await withdrawalApi.create({ investorId, totalAmount: total, withdrawalDate, reference, notes });
      toast.success('Profit withdrawn and transferred to available capital.');
      onSuccess();
    } catch (err) {
      // Backend is authoritative — its rejection message (e.g. insufficient remaining
      // profit) is shown verbatim rather than re-deriving our own error text.
      toast.error(err.response?.data?.message || 'Failed to record withdrawal.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="font-semibold mb-4">Record Profit Withdrawal & Capital Reinvestment</h3>

        {!fixedInvestorId && (
          <div className="mb-3">
            <label className="label">Investor *</label>
            <select className="input" value={investorId} onChange={(e) => setInvestorId(e.target.value)}>
              <option value="">Select investor...</option>
              {investors.map((inv) => (
                <option key={inv._id} value={inv._id}>
                  {inv.name} ({inv.investorId})
                </option>
              ))}
            </select>
          </div>
        )}

        {profile && (
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 mb-3 text-sm space-y-1">
            <p className="font-semibold text-xs text-gray-400 uppercase mb-1">Investor Side</p>
            <p><span className="text-gray-500">Investor Profit Share:</span> {formatCurrency(profile.investorProfitShare)}</p>
            <p><span className="text-gray-500">Already Withdrawn:</span> {formatCurrency(profile.investorProfitWithdrawn)}</p>
            <p className="text-green-600 font-medium"><span className="text-gray-500 font-normal">Investor Available:</span> {formatCurrency(profile.investorRemainingProfit)}</p>
            <p className="font-semibold text-xs text-gray-400 uppercase mt-2 mb-1">Owner Side (from this investor's contracts)</p>
            <p><span className="text-gray-500">Owner Profit Share:</span> {formatCurrency(profile.ownerProfitShare)}</p>
            <p><span className="text-gray-500">Already Withdrawn:</span> {formatCurrency(profile.ownerProfitWithdrawn)}</p>
            <p className="text-green-600 font-medium"><span className="text-gray-500 font-normal">Owner Available:</span> {formatCurrency(profile.ownerRemainingProfit)}</p>
            <p className="text-xs text-gray-400 mt-1">
              Max withdrawal = PKR {formatCurrency(Math.min(profile.investorRemainingProfit, profile.ownerRemainingProfit) * 2)} (both sides must cover their 50% share)
            </p>
            <div className="p-2 rounded bg-primary-50 dark:bg-primary-900/20 text-xs text-primary-700 dark:text-primary-300 mt-2">
              Note: Withdrawn profit is transferred directly into Available Capital (50% Investor / 50% Owner) for reinvestment.
            </div>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <label className="label">Total Withdrawal Amount *</label>
            <input type="number" className="input" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Owner Share (auto)</label>
              <input type="text" className="input bg-gray-50 dark:bg-gray-800" value={formatCurrency(ownerShare)} disabled />
            </div>
            <div>
              <label className="label">Investor Share (auto)</label>
              <input type="text" className="input bg-gray-50 dark:bg-gray-800" value={formatCurrency(investorShare)} disabled />
            </div>
          </div>
          {exceedsRemaining && (
            <p className="text-xs text-red-600">
              Investor's share ({formatCurrency(investorShare)}) exceeds their remaining profit ({formatCurrency(profile.investorRemainingProfit)}).
            </p>
          )}
          {profile && ownerShare > profile.ownerRemainingProfit && (
            <p className="text-xs text-red-600">
              Owner's share ({formatCurrency(ownerShare)}) exceeds Owner's remaining profit on this investor's contracts ({formatCurrency(profile.ownerRemainingProfit)}).
            </p>
          )}

          <div>
            <label className="label">Withdrawal Date</label>
            <input type="date" className="input" value={withdrawalDate} onChange={(e) => setWithdrawalDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Reference (optional)</label>
            <input className="input" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <label className="label">Notes (optional)</label>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 flex-wrap mt-5">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Submit Withdrawal'}
          </button>
        </div>
      </div>
    </div>
  );
}
