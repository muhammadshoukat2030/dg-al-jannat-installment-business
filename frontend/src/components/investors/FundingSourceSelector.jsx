import { useEffect, useState } from 'react';
import { investorApi } from '../../api/services';
import { formatCurrency } from '../../utils/format';
import { queryInvestorsOffline } from '../../offline/db';

/**
 * Funding source picker used when creating an installment contract.
 *
 * value: { fundingSource: 'BUSINESS' | 'INVESTOR', investorId, capitalDeployed }
 * onChange(next) — called with the updated value object.
 * suggestedAmount — defaults the "Capital to Deploy" field (usually purchase cost).
 *
 * This component only guides the admin — it never enforces the actual business rule.
 * The backend independently re-validates that capitalDeployed does not exceed the
 * selected investor's real available capital before the contract is created.
 */
export default function FundingSourceSelector({ value, onChange, suggestedAmount }) {
  const [investors, setInvestors] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedInvestor, setSelectedInvestor] = useState(null);
  const [loadingInvestors, setLoadingInvestors] = useState(false);

  useEffect(() => {
    if (value.fundingSource !== 'INVESTOR') return;
    const timer = setTimeout(() => {
      setLoadingInvestors(true);
      // 1. Local-first read from IndexedDB
      queryInvestorsOffline({ search, status: 'active', limit: 10 })
        .then((local) => {
          if (local && local.data) setInvestors(local.data);
        })
        .catch(() => {});

      // 2. Server revalidation when online
      if (navigator.onLine) {
        investorApi
          .list({ search, status: 'active', limit: 10 })
          .then((res) => {
            if (res.data?.data) setInvestors(res.data.data);
          })
          .catch(() => {})
          .finally(() => setLoadingInvestors(false));
      } else {
        setLoadingInvestors(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [search, value.fundingSource]);

  function selectFundingSource(source) {
    if (source === 'BUSINESS') {
      setSelectedInvestor(null);
      onChange({ fundingSource: 'BUSINESS', investorId: null, capitalDeployed: 0 });
    } else {
      onChange({ fundingSource: 'INVESTOR', investorId: value.investorId, capitalDeployed: value.capitalDeployed || suggestedAmount || '' });
    }
  }

  function selectInvestor(inv) {
    setSelectedInvestor(inv);
    setSearch('');
    setInvestors([]);
    onChange({
      fundingSource: 'INVESTOR',
      investorId: inv._id,
      capitalDeployed: value.capitalDeployed || suggestedAmount || '',
    });
  }

  const deployAmount = Number(value.capitalDeployed) || 0;
  const exceedsAvailable = selectedInvestor && deployAmount > selectedInvestor.capitalAvailable;

  return (
    <div className="space-y-3 border-t border-gray-100 dark:border-gray-800 pt-4">
      <label className="label">Funding Source *</label>
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="fundingSource"
            checked={value.fundingSource === 'BUSINESS'}
            onChange={() => selectFundingSource('BUSINESS')}
          />
          Business / Own Funds
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name="fundingSource"
            checked={value.fundingSource === 'INVESTOR'}
            onChange={() => selectFundingSource('INVESTOR')}
          />
          Investor
        </label>
      </div>

      {value.fundingSource === 'INVESTOR' && (
        <div className="space-y-3">
          {!selectedInvestor ? (
            <div>
              <label className="label">Search Investor *</label>
              <input
                className="input"
                placeholder="Search by name, phone, ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {loadingInvestors && <p className="text-xs text-gray-400 mt-1">Searching...</p>}
              {investors.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg mt-1 max-h-48 overflow-y-auto">
                  {investors.map((inv) => (
                    <button
                      type="button"
                      key={inv._id}
                      onClick={() => selectInvestor(inv)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 border-b border-gray-100 dark:border-gray-800 last:border-0"
                    >
                      <p className="font-medium">{inv.name} <span className="text-gray-400 font-normal">({inv.investorId})</span></p>
                      <p className="text-xs text-gray-500">Available: {formatCurrency(inv.capitalAvailable)}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm">
                  {selectedInvestor.name} <span className="text-gray-400 font-normal">({selectedInvestor.investorId})</span>
                </p>
                <button
                  type="button"
                  className="text-xs text-primary-600 hover:underline"
                  onClick={() => {
                    setSelectedInvestor(null);
                    onChange({ fundingSource: 'INVESTOR', investorId: null, capitalDeployed: value.capitalDeployed });
                  }}
                >
                  Change
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <p><span className="text-gray-500">Invested:</span> {formatCurrency(selectedInvestor.totalInvested)}</p>
                <p><span className="text-gray-500">Held:</span> {formatCurrency(selectedInvestor.capitalHeld)}</p>
                <p><span className="text-gray-500">Deployed:</span> {formatCurrency(selectedInvestor.capitalDeployed)}</p>
                <p className="text-green-600 font-medium"><span className="text-gray-500 font-normal">Available:</span> {formatCurrency(selectedInvestor.capitalAvailable)}</p>
              </div>

              <div>
                <label className="label">Capital to Deploy *</label>
                <input
                  type="number"
                  className="input"
                  value={value.capitalDeployed}
                  onChange={(e) => onChange({ ...value, capitalDeployed: e.target.value })}
                />
                {exceedsAvailable && (
                  <p className="text-xs text-red-600 mt-1">
                    This exceeds {selectedInvestor.name}'s available capital ({formatCurrency(selectedInvestor.capitalAvailable)}).
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
