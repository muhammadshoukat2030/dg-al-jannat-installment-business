import { useEffect, useState, useMemo } from 'react';
import { investorApi, ownerApi } from '../../api/services';
import { formatCurrency } from '../../utils/format';
import { queryInvestorsOffline, getOwnerDataOffline } from '../../offline/db';

/**
 * Multiple Funding Sources selector for use during contract creation.
 *
 * Props:
 *   purchaseCost  — number (PKR). Required capital that must be fully funded.
 *   onChange({ allocations, isValid }) — called whenever selections/amounts change.
 *
 * Money math uses integer "paisa" (1 PKR = 100 paisa) throughout to avoid
 * IEEE-754 floating-point drift. All display values are converted back to PKR.
 *
 * Branding: Developed by SHOUKAT | 03348004300
 */

// --- paisa helpers ---------------------------------------------------------
const toPaisa = (pkr) => Math.round((Number(pkr) || 0) * 100);
const toPkr   = (paisa) => paisa / 100;

export default function MultiFundingSelector({ purchaseCost, onChange }) {
  const [investors, setInvestors]       = useState([]);
  const [ownerCapital, setOwnerCapital] = useState(null);
  const [loadingData, setLoadingData]   = useState(true);
  const [search, setSearch]             = useState('');

  // allocations: Map<key, { sourceType, investorId|null, name, availPaisa, amountStr }>
  // key = 'OWNER' or investor._id
  const [selections, setSelections] = useState(new Map());

  // ── Load investors + owner capital once ────────────────────────────────────
  useEffect(() => {
    setLoadingData(true);
    // 1. Immediate local-first read from IndexedDB
    Promise.all([
      queryInvestorsOffline({ status: 'active', limit: 200 }).catch(() => null),
      getOwnerDataOffline().catch(() => null),
    ]).then(([localInv, localOwner]) => {
      if (localInv?.data && localInv.data.length > 0) {
        setInvestors(localInv.data);
      }
      if (localOwner?.capital) {
        setOwnerCapital(localOwner.capital);
      }
    });

    // 2. Server revalidation when online
    if (navigator.onLine) {
      Promise.all([
        investorApi.list({ status: 'active', limit: 200 }),
        ownerApi.capital(),
      ])
        .then(([invRes, ownerRes]) => {
          setInvestors(invRes.data.data || []);
          setOwnerCapital(ownerRes.data.data);
        })
        .catch(() => {
          // retain local data if offline
        })
        .finally(() => setLoadingData(false));
    } else {
      setLoadingData(false);
    }
  }, []);

  // ── Derived math (paisa) ───────────────────────────────────────────────────
  const costPaisa = toPaisa(purchaseCost);

  const rows = useMemo(() => Array.from(selections.values()), [selections]);

  const totalAllocatedPaisa = useMemo(
    () => rows.reduce((sum, r) => sum + toPaisa(r.amountStr), 0),
    [rows]
  );

  const remainingPaisa = costPaisa - totalAllocatedPaisa;

  // Per-row error flags
  function rowError(row) {
    const amtPaisa = toPaisa(row.amountStr);
    if (amtPaisa <= 0) return 'Amount must be greater than 0.';
    if (amtPaisa > row.availPaisa) {
      return `Exceeds available balance (${formatCurrency(toPkr(row.availPaisa))}).`;
    }
    return null;
  }

  const hasRowError = rows.some((r) => rowError(r) !== null);
  const isValid =
    !loadingData &&
    ownerCapital !== null &&
    rows.length > 0 &&
    costPaisa > 0 &&
    remainingPaisa === 0 &&
    !hasRowError;

  // ── Notify parent on every change ─────────────────────────────────────────
  useEffect(() => {
    const allocations = rows
      .filter((r) => toPaisa(r.amountStr) > 0)
      .map((r) => ({
        sourceType: r.sourceType,
        investorId: r.sourceType === 'INVESTOR' ? r.investorId : null,
        amount: toPkr(toPaisa(r.amountStr)),
      }));
    if (typeof onChange === 'function') {
      onChange({ allocations, isValid });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selections, isValid]);

  // ── Checkbox toggle ────────────────────────────────────────────────────────
  function toggleSource(key, meta) {
    setSelections((prev) => {
      const next = new Map(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.set(key, { ...meta, amountStr: '' });
      }
      return next;
    });
  }

  function setAmount(key, amountStr) {
    setSelections((prev) => {
      const next = new Map(prev);
      const row  = next.get(key);
      if (row) next.set(key, { ...row, amountStr });
      return next;
    });
  }

  // ── Filtered investor list ─────────────────────────────────────────────────
  const filteredInvestors = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return investors;
    return investors.filter(
      (inv) =>
        inv.name.toLowerCase().includes(q) ||
        (inv.investorId || '').toLowerCase().includes(q) ||
        (inv.contactNumber || '').includes(q)
    );
  }, [investors, search]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loadingData) {
    return (
      <div className="space-y-2 border-t border-gray-100 dark:border-gray-800 pt-4">
        <p className="text-sm text-gray-400">Loading funding sources…</p>
      </div>
    );
  }

  const ownerKey = 'OWNER';
  const ownerAvailPaisa = ownerCapital ? toPaisa(ownerCapital.capitalAvailable) : 0;

  return (
    <div className="space-y-4 border-t border-gray-100 dark:border-gray-800 pt-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
        Multiple Funding Sources *
      </h3>

      {/* ── Live Summary ─────────────────────────────────────────────────── */}
      {costPaisa > 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 grid grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-xs text-gray-400">Purchase Cost</p>
            <p className="font-semibold">{formatCurrency(purchaseCost)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Total Allocated</p>
            <p className={`font-semibold ${remainingPaisa === 0 ? 'text-green-600' : 'text-orange-500'}`}>
              {formatCurrency(toPkr(totalAllocatedPaisa))}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Remaining to Fund</p>
            <p className={`font-semibold ${remainingPaisa === 0 ? 'text-green-600' : remainingPaisa < 0 ? 'text-red-600' : 'text-orange-500'}`}>
              {remainingPaisa < 0 ? '-' : ''}{formatCurrency(toPkr(Math.abs(remainingPaisa)))}
            </p>
          </div>
        </div>
      )}

      {remainingPaisa < 0 && (
        <p className="text-xs text-red-600 font-medium">
          ⚠ Total allocated exceeds purchase cost by {formatCurrency(toPkr(-remainingPaisa))}. Reduce allocations.
        </p>
      )}

      {/* ── Owner Row ────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4 accent-primary-600"
            checked={selections.has(ownerKey)}
            onChange={() =>
              toggleSource(ownerKey, {
                sourceType: 'OWNER',
                investorId: null,
                name: 'Owner (Business)',
                availPaisa: ownerAvailPaisa,
              })
            }
          />
          <span className="text-sm font-medium">Owner / Business Funds</span>
          <span className="ml-auto text-xs text-gray-500">
            Available: {formatCurrency(toPkr(ownerAvailPaisa))}
          </span>
        </label>

        {selections.has(ownerKey) && (
          <div className="pl-7 space-y-1">
            <input
              type="number"
              min="1"
              placeholder="Amount (PKR)"
              className="input"
              value={selections.get(ownerKey).amountStr}
              onChange={(e) => setAmount(ownerKey, e.target.value)}
            />
            {rowError(selections.get(ownerKey)) && (
              <p className="text-xs text-red-600">{rowError(selections.get(ownerKey))}</p>
            )}
            {ownerAvailPaisa === 0 && (
              <p className="text-xs text-red-600">
                Owner has PKR 0 available. Add capital from Owner Dashboard first.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Investor Search ──────────────────────────────────────────────── */}
      <div>
        <input
          className="input"
          placeholder="Search investors by name, ID or phone…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Investor List ────────────────────────────────────────────────── */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {filteredInvestors.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-2">No active investors found.</p>
        )}
        {filteredInvestors.map((inv) => {
          const key         = inv._id;
          const availPaisa  = toPaisa(inv.capitalAvailable);
          const isChecked   = selections.has(key);
          const row         = selections.get(key);
          const err         = isChecked ? rowError(row) : null;

          return (
            <div
              key={key}
              className={`rounded-lg border p-3 space-y-2 ${
                isChecked
                  ? 'border-primary-400 dark:border-primary-600 bg-primary-50/30 dark:bg-primary-900/10'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-primary-600"
                  checked={isChecked}
                  onChange={() =>
                    toggleSource(key, {
                      sourceType: 'INVESTOR',
                      investorId: inv._id,
                      name: inv.name,
                      availPaisa,
                    })
                  }
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {inv.name}{' '}
                    <span className="text-gray-400 font-normal text-xs">({inv.investorId})</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    Available:{' '}
                    <span className={availPaisa === 0 ? 'text-red-500' : 'text-green-600'}>
                      {formatCurrency(inv.capitalAvailable)}
                    </span>
                  </p>
                </div>
              </label>

              {isChecked && (
                <div className="pl-7 space-y-1">
                  <input
                    type="number"
                    min="1"
                    placeholder="Amount (PKR)"
                    className="input"
                    value={row.amountStr}
                    onChange={(e) => setAmount(key, e.target.value)}
                  />
                  {err && <p className="text-xs text-red-600">{err}</p>}
                  {availPaisa === 0 && (
                    <p className="text-xs text-red-600">
                      This investor has PKR 0 available capital.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Selected summary ─────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 text-xs space-y-1">
          <p className="font-semibold text-gray-600 dark:text-gray-300 mb-1">Selected Allocations:</p>
          {rows.map((r) => (
            <div key={r.sourceType === 'OWNER' ? 'OWNER' : r.investorId} className="flex justify-between">
              <span>{r.name}</span>
              <span className={toPaisa(r.amountStr) > r.availPaisa ? 'text-red-600' : ''}>
                {r.amountStr ? formatCurrency(Number(r.amountStr)) : '—'}
              </span>
            </div>
          ))}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-1 flex justify-between font-semibold">
            <span>Total</span>
            <span className={remainingPaisa === 0 ? 'text-green-600' : 'text-orange-500'}>
              {formatCurrency(toPkr(totalAllocatedPaisa))}
            </span>
          </div>
        </div>
      )}

      {/* ── Validation hint ──────────────────────────────────────────────── */}
      {costPaisa > 0 && !isValid && (
        <p className="text-xs text-orange-600">
          {rows.length === 0
            ? 'Select at least one funding source and enter an amount.'
            : remainingPaisa !== 0
            ? `Funding is ${remainingPaisa > 0 ? 'short by' : 'over by'} ${formatCurrency(toPkr(Math.abs(remainingPaisa)))}. Total must equal Purchase Cost exactly.`
            : 'Fix the errors above before saving.'}
        </p>
      )}

      <p className="text-xs text-theme-muted text-right">
        Software Development by SHOUKAT | 03348004300
      </p>
    </div>
  );
}
