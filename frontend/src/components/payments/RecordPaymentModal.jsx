import { useState } from 'react';
import toast from 'react-hot-toast';
import { installmentApi } from '../../api/services';
import { formatCurrency, formatDate } from '../../utils/format';

export default function RecordPaymentModal({ installment, onClose, onSuccess }) {
  const outstanding = Math.round((installment.amountDue - installment.paidAmount) * 100) / 100;
  const [amount, setAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState('Cash');
  const [notes, setNotes] = useState('');
  const [confirmingZero, setConfirmingZero] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submitPayment() {
    const numAmount = Number(amount);
    if (numAmount <= 0) {
      setConfirmingZero(true);
      return;
    }
    setSaving(true);
    try {
      // paymentDate is the date the customer actually paid — deliberately separate from
      // the record's createdAt/entry timestamp, since admins often log payments later.
      await installmentApi.pay(installment._id, { amount: numAmount, paymentMethod: method, paymentDate, notes });
      toast.success('Payment recorded.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmMissed() {
    setSaving(true);
    try {
      await installmentApi.markMissed(installment._id, { confirm: true, reason: notes, recordedDate: paymentDate });
      toast.success('Installment marked as missed.');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to mark as missed.');
    } finally {
      setSaving(false);
    }
  }

  if (confirmingZero) {
    return (
      <Modal onClose={onClose} title="Confirm Missed Installment">
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
          No payment has been received for this installment. Mark this installment as MISSED?
        </p>
        <div className="flex justify-end gap-3">
          <button className="btn-secondary" onClick={() => setConfirmingZero(false)}>
            Cancel
          </button>
          <button className="btn-danger" onClick={confirmMissed} disabled={saving}>
            {saving ? 'Saving...' : 'Confirm Missed'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal onClose={onClose} title={`Installment #${installment.installmentNumber}`}>
      <div className="space-y-1 text-sm mb-4 text-gray-600 dark:text-gray-300">
        <p>Due Date: {formatDate(installment.dueDate)}</p>
        <p>Amount Due: {formatCurrency(installment.amountDue)}</p>
        <p>Previously Paid: {formatCurrency(installment.paidAmount)}</p>
        <p>Remaining For Installment: {formatCurrency(outstanding)}</p>
      </div>

      <div className="space-y-3">
        <div>
          <label className="label">Paid Amount</label>
          <input
            type="number"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Enter amount (0 = missed)"
          />
        </div>
        <div>
          <label className="label">Actual Payment Date</label>
          <input type="date" className="input" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          <p className="text-xs text-gray-400 mt-1">The date the customer actually paid — not necessarily today.</p>
        </div>
        <div>
          <label className="label">Payment Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option>Cash</option>
            <option>Bank Transfer</option>
            <option>Other</option>
          </select>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-5">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" onClick={submitPayment} disabled={saving || amount === ''}>
          {saving ? 'Saving...' : 'Save Payment'}
        </button>
      </div>
    </Modal>
  );
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
