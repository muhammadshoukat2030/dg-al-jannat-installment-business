import { useState, useMemo } from 'react';
import toast from 'react-hot-toast';
import { investorApi } from '../../api/services';
import { formatCurrency } from '../../utils/format';
import { put, enqueueOperation } from '../../offline/db';
import { refreshPendingCount } from '../../offline/syncManager';

/**
 * Unified Investor Transaction Modal
 * Supports:
 * 1. Withdraw Profit (Cash Out) - decreases profit only
 * 2. Transfer Profit to Capital - decreases profit, increases available capital
 * 3. Add Capital - increases capital only
 * 4. Return / Withdraw Capital - decreases capital only (validated against undeployed capital)
 */
export default function TransactionModal({ investor, capital, profit, defaultType, onClose, onSuccess }) {
  const [transactionType, setTransactionType] = useState(defaultType || 'PROFIT_CASH_WITHDRAWAL');
  const [amount, setAmount] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const availableProfit = profit?.investorRemainingProfit ?? 0;
  const availableCapital = capital?.capitalAvailable ?? 0;
  const capitalHeld = capital?.capitalHeld ?? 0;

  const numAmount = Number(amount) || 0;

  // Determine limit and validation based on transaction type
  const { availableLimit, limitLabel, isExcessive, exceedsMessage, maxAllowedText } = useMemo(() => {
    if (transactionType === 'PROFIT_CASH_WITHDRAWAL') {
      const isOver = numAmount > availableProfit + 0.009;
      return {
        availableLimit: availableProfit,
        limitLabel: 'Available Profit',
        maxAllowedText: formatCurrency(availableProfit),
        isExcessive: isOver,
        exceedsMessage: `Amount exceeds available profit (${formatCurrency(availableProfit)}).`,
      };
    }
    if (transactionType === 'PROFIT_TO_CAPITAL') {
      const isOver = numAmount > availableProfit + 0.009;
      return {
        availableLimit: availableProfit,
        limitLabel: 'Available Profit',
        maxAllowedText: formatCurrency(availableProfit),
        isExcessive: isOver,
        exceedsMessage: `Amount exceeds available profit (${formatCurrency(availableProfit)}).`,
      };
    }
    if (transactionType === 'RETURN_TO_INVESTOR') {
      const isOver = numAmount > availableCapital + 0.009;
      return {
        availableLimit: availableCapital,
        limitLabel: 'Available (Undeployed) Capital',
        maxAllowedText: formatCurrency(availableCapital),
        isExcessive: isOver,
        exceedsMessage: `Amount exceeds available undeployed capital (${formatCurrency(availableCapital)}). Capital deployed in customer contracts cannot be withdrawn.`,
      };
    }
    // INVESTMENT_IN
    return {
      availableLimit: null,
      limitLabel: 'Current Capital Held',
      maxAllowedText: 'No upper limit',
      isExcessive: false,
      exceedsMessage: null,
    };
  }, [transactionType, numAmount, availableProfit, availableCapital]);

  const isPositive = numAmount > 0;
  const isZeroOrNegative = amount !== '' && numAmount <= 0;
  const isValidAmount = isPositive && !isExcessive;

  async function submit(e) {
    e.preventDefault();
    if (!isValidAmount) {
      if (isExcessive) toast.error(exceedsMessage);
      else if (isZeroOrNegative) toast.error('Amount must be greater than zero.');
      else toast.error('Enter a valid amount greater than 0.');
      return;
    }

    setSaving(true);
    try {
      if (!navigator.onLine && (transactionType === 'INVESTMENT_IN' || transactionType === 'RETURN_TO_INVESTOR')) {
        const operationId = 'op_tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const localTx = {
          _id: 'local_' + operationId,
          investorId: investor._id,
          transactionType,
          amount: numAmount,
          transactionDate: transactionDate || new Date().toISOString(),
          notes,
          operationId,
        };
        await put('investorTransactions', localTx);
        await enqueueOperation({
          operationId,
          type: 'ADD_INVESTOR_TRANSACTION',
          payload: { investorId: investor._id, transactionType, amount: numAmount, transactionDate, notes },
        });
        await refreshPendingCount();
        toast.success(
          transactionType === 'INVESTMENT_IN'
            ? 'Capital added offline. Will sync automatically.'
            : 'Capital return recorded offline. Will sync automatically.'
        );
        if (typeof onSuccess === 'function') onSuccess();
        return;
      }

      if (transactionType === 'PROFIT_CASH_WITHDRAWAL' || transactionType === 'PROFIT_TO_CAPITAL') {
        await investorApi.profitTransaction(investor._id, {
          transactionType,
          amount: numAmount,
          transactionDate,
          notes,
        });
        toast.success(
          transactionType === 'PROFIT_CASH_WITHDRAWAL'
            ? 'Cash profit withdrawal recorded.'
            : 'Profit successfully transferred to available capital.'
        );
      } else {
        await investorApi.addTransaction(investor._id, {
          transactionType,
          amount: numAmount,
          transactionDate,
          notes,
        });
        toast.success(
          transactionType === 'INVESTMENT_IN' ? 'Capital added successfully.' : 'Capital return recorded.'
        );
      }
      if (typeof onSuccess === 'function') onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transaction failed.');
    } finally {
      setSaving(false);
    }
  }

  function handleFillMax() {
    if (availableLimit !== null && availableLimit > 0) {
      setAmount(String(availableLimit));
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Record Investor Transaction</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Investor: <span className="font-semibold text-gray-800 dark:text-gray-200">{investor.name}</span> ({investor.investorId})
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">Transaction Type *</label>
            <select
              className="input font-medium"
              value={transactionType}
              onChange={(e) => {
                setTransactionType(e.target.value);
                setAmount('');
              }}
            >
              <option value="PROFIT_CASH_WITHDRAWAL">Withdraw Profit (Cash Out)</option>
              <option value="PROFIT_TO_CAPITAL">Transfer Profit to Capital (Reinvest)</option>
              <option value="INVESTMENT_IN">Add Capital (New Money In)</option>
              <option value="RETURN_TO_INVESTOR">Return / Withdraw Capital (Money Out)</option>
            </select>
          </div>

          {/* Dynamic Available Balance & Max Limit Banner */}
          <div className="rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-500">{limitLabel}:</span>
              <span className="font-semibold text-green-600 dark:text-green-400">
                {formatCurrency(availableLimit !== null ? availableLimit : capitalHeld)}
              </span>
            </div>

            <div className="flex justify-between items-center border-t border-gray-100 dark:border-gray-700/60 pt-1.5">
              <span className="text-xs text-gray-500">Maximum Allowed:</span>
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-gray-800 dark:text-gray-200">
                  {maxAllowedText}
                </span>
                {availableLimit !== null && availableLimit > 0 && (
                  <button
                    type="button"
                    onClick={handleFillMax}
                    className="text-[11px] font-medium px-1.5 py-0.5 rounded bg-primary-50 dark:bg-primary-950 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-800 hover:bg-primary-100"
                  >
                    Fill Max
                  </button>
                )}
              </div>
            </div>

            {transactionType === 'PROFIT_CASH_WITHDRAWAL' && (
              <p className="text-xs text-gray-400">
                Pays out profit only; does not reduce capital. Money leaves the business.
              </p>
            )}
            {transactionType === 'PROFIT_TO_CAPITAL' && (
              <p className="text-xs text-primary-600 dark:text-primary-400">
                Moves available profit into available capital. Internal transfer without external cash movement.
              </p>
            )}
            {transactionType === 'INVESTMENT_IN' && (
              <p className="text-xs text-gray-400">
                Adds new external money to capital account. Increases available funding for contracts.
              </p>
            )}
            {transactionType === 'RETURN_TO_INVESTOR' && (
              <p className="text-xs text-orange-600 dark:text-orange-400">
                Returns available capital to the investor; does not affect profit. Deducted from undeployed capital only.
              </p>
            )}
          </div>

          <div>
            <label className="label">Amount (PKR) *</label>
            <input
              type="number"
              step="any"
              min="0.01"
              className={`input ${(isExcessive || isZeroOrNegative) ? 'border-red-500 focus:border-red-500 ring-1 ring-red-500' : ''}`}
              placeholder="Enter amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            {isZeroOrNegative && <p className="text-xs text-red-600 mt-1">Amount must be greater than zero.</p>}
            {isExcessive && <p className="text-xs text-red-600 mt-1">{exceedsMessage}</p>}
          </div>

          <div>
            <label className="label">Transaction Date</label>
            <input
              type="date"
              className="input"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Add reference or transaction remarks..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => typeof onClose === 'function' && onClose()} disabled={saving}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || !isValidAmount}
            >
              {saving ? 'Processing...' : 'Confirm Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
