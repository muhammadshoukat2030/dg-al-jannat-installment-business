import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Trash2, PlusCircle } from 'lucide-react';
import { fundingApi, investorApi, ownerApi } from '../../api/services';
import { formatCurrency } from '../../utils/format';

/**
 * Multi-source funding allocation editor for one contract: Owner + any number of
 * investors, each with a custom amount. All real validation (does each investor
 * actually have that much available capital, does the total match the contract's
 * required capital) happens server-side in fundingController.allocateFunding —
 * this UI only mirrors those rules for immediate feedback so mistakes are caught
 * before submitting, not to replace the backend check.
 */
export default function FundingAllocationEditor({ planId, requiredCapital, onSaved }) {
  const [rows, setRows] = useState([]);
  const [investors, setInvestors] = useState([]);
  const [ownerCapital, setOwnerCapital] = useState(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fundingApi.get(planId), investorApi.list({ status: 'active', limit: 200 }), ownerApi.capital()])
      .then(([fundingRes, investorRes, ownerRes]) => {
        const existing = fundingRes.data.data;
        setInvestors(investorRes.data.data);
        setOwnerCapital(ownerRes.data.data);
        if (existing.length > 0) {
          setRows(
            existing.map((a) => ({
              sourceType: a.sourceType,
              investorId: a.investorId?._id || a.investorId || '',
              amount: a.amount,
            }))
          );
        } else {
          setRows([{ sourceType: 'OWNER', investorId: '', amount: '' }]);
        }
      })
      .finally(() => setLoading(false));
  }, [planId]);

  function updateRow(index, field, value) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  }

  function addRow() {
    setRows((prev) => [...prev, { sourceType: 'INVESTOR', investorId: '', amount: '' }]);
  }

  function removeRow(index) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function investorAvailable(investorId) {
    const inv = investors.find((i) => i._id === investorId);
    return inv ? inv.capitalAvailable : null;
  }

  const totalAllocated = rows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const remaining = Math.round((requiredCapital - totalAllocated) * 100) / 100;
  const ownerRowsTotal = rows.filter((r) => r.sourceType === 'OWNER').reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const ownerExceeds = ownerCapital != null && ownerRowsTotal > ownerCapital.capitalAvailable;
  const hasRowError =
    ownerExceeds ||
    rows.some((r) => {
      if (r.sourceType !== 'INVESTOR' || !r.investorId) return false;
      const avail = investorAvailable(r.investorId);
      return avail != null && Number(r.amount) > avail;
    });
  const canSubmit = !hasRowError && Math.abs(remaining) < 0.01 && rows.every((r) => Number(r.amount) > 0 && (r.sourceType === 'OWNER' || r.investorId));

  async function submit() {
    setSaving(true);
    try {
      await fundingApi.allocate(
        planId,
        rows.map((r) => ({ sourceType: r.sourceType, investorId: r.sourceType === 'INVESTOR' ? r.investorId : null, amount: Number(r.amount) }))
      );
      toast.success('Funding allocation saved.');
      onSaved?.();
    } catch (err) {
      // Backend's rejection message (insufficient capital, mismatched total, inactive
      // investor, etc.) is shown verbatim — it is the authoritative source of truth.
      toast.error(err.response?.data?.message || 'Failed to save funding allocation.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-gray-400 py-4 text-center">Loading funding allocation...</p>;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <Stat label="Required Capital" value={formatCurrency(requiredCapital)} />
        <Stat label="Total Allocated" value={formatCurrency(totalAllocated)} />
        <Stat label="Unallocated" value={formatCurrency(remaining)} tone={Math.abs(remaining) < 0.01 ? 'good' : 'bad'} />
        <Stat label="Owner Available" value={ownerCapital ? formatCurrency(ownerCapital.capitalAvailable) : '—'} tone={ownerExceeds ? 'bad' : 'default'} />
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => {
          const avail = row.sourceType === 'INVESTOR' ? investorAvailable(row.investorId) : null;
          const rowExceeds = avail != null && Number(row.amount) > avail;
          return (
            <div key={i} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <select
                  className="input w-auto"
                  value={row.sourceType}
                  onChange={(e) => updateRow(i, 'sourceType', e.target.value)}
                >
                  <option value="OWNER">Owner</option>
                  <option value="INVESTOR">Investor</option>
                </select>
                <button type="button" className="text-red-600 p-1" onClick={() => removeRow(i)} aria-label="Remove funding source">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {row.sourceType === 'OWNER' && ownerCapital && (
                <p className="text-xs text-gray-500">Owner Available Capital: {formatCurrency(ownerCapital.capitalAvailable)}</p>
              )}

              {row.sourceType === 'INVESTOR' && (
                <div>
                  <select
                    className="input"
                    value={row.investorId}
                    onChange={(e) => updateRow(i, 'investorId', e.target.value)}
                  >
                    <option value="">Select investor...</option>
                    {investors.map((inv) => (
                      <option key={inv._id} value={inv._id}>
                        {inv.name} ({inv.investorId}) — Available: {formatCurrency(inv.capitalAvailable)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="label">Allocated Amount</label>
                <input
                  type="number"
                  className="input"
                  value={row.amount}
                  onChange={(e) => updateRow(i, 'amount', e.target.value)}
                />
                {rowExceeds && (
                  <p className="text-xs text-red-600 mt-1">Exceeds this investor's available capital ({formatCurrency(avail)}).</p>
                )}
                {row.sourceType === 'OWNER' && ownerExceeds && (
                  <p className="text-xs text-red-600 mt-1">
                    Total Owner allocation exceeds available Owner capital ({formatCurrency(ownerCapital.capitalAvailable)}). Add
                    more capital from the Owner Dashboard first.
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <button type="button" className="btn-secondary w-full sm:w-auto" onClick={addRow}>
        <PlusCircle className="w-4 h-4" /> Add Funding Source
      </button>

      {!canSubmit && (
        <p className="text-xs text-orange-600">
          Total allocated must exactly equal the required capital, and no row may exceed its source's available capital.
        </p>
      )}

      <div className="flex justify-end">
        <button className="btn-primary" onClick={submit} disabled={saving || !canSubmit}>
          {saving ? 'Saving...' : 'Save Funding Allocation'}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }) {
  const tones = {
    default: 'text-gray-900 dark:text-gray-100',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="min-w-0">
      <p className="text-xs text-gray-500 truncate">{label}</p>
      <p className={`font-semibold break-words ${tones[tone]}`}>{value}</p>
    </div>
  );
}
