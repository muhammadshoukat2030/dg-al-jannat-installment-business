import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { investorApi } from '../api/services';
import { put, enqueueOperation } from '../offline/db';
import { refreshPendingCount } from '../offline/syncManager';

const empty = {
  name: '',
  phone: '',
  whatsapp: '',
  email: '',
  cnic: '',
  address: '',
  notes: '',
};

export default function AddInvestor() {
  const [investor, setInvestor] = useState(empty);
  const [initialInvestment, setInitialInvestment] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  function update(field, value) {
    setInvestor((s) => ({ ...s, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!investor.name || !investor.phone) {
      toast.error('Name and phone are required.');
      return;
    }
    setSaving(true);
    try {
      if (!navigator.onLine) {
        const operationId = 'op_inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const tempId = 'temp_' + operationId;
        const localRecord = {
          _id: tempId,
          ...investor,
          investorId: 'PENDING_SYNC',
          createdAt: new Date().toISOString(),
          operationId,
        };
        await put('investors', localRecord);
        await enqueueOperation({
          operationId,
          type: 'CREATE_INVESTOR',
          payload: investor,
        });

        if (initialInvestment && Number(initialInvestment) > 0) {
          const txOpId = 'op_tx_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          await put('investorTransactions', {
            _id: 'local_' + txOpId,
            investorId: tempId,
            transactionType: 'INVESTMENT_IN',
            amount: Number(initialInvestment),
            transactionDate: new Date().toISOString(),
            notes: 'Initial investment',
            operationId: txOpId,
          });
          await enqueueOperation({
            operationId: txOpId,
            type: 'ADD_INVESTOR_TRANSACTION',
            payload: {
              investorId: tempId,
              transactionType: 'INVESTMENT_IN',
              amount: Number(initialInvestment),
              notes: 'Initial investment',
            },
          });
        }

        await refreshPendingCount();
        toast.success('Investor saved offline. Will sync automatically when online.');
        navigate('/investors');
        return;
      }

      const res = await investorApi.create(investor);
      const created = res.data.data;

      if (initialInvestment && Number(initialInvestment) > 0) {
        await investorApi.addTransaction(created._id, {
          transactionType: 'INVESTMENT_IN',
          amount: Number(initialInvestment),
          notes: 'Initial investment',
        });
      }

      toast.success('Investor added successfully.');
      navigate(`/investors/${created._id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save investor.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Add Investor</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Investor Name *</label>
            <input className="input" value={investor.name} onChange={(e) => update('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" value={investor.phone} onChange={(e) => update('phone', e.target.value)} required />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input className="input" value={investor.whatsapp} onChange={(e) => update('whatsapp', e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={investor.email} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <label className="label">CNIC / ID</label>
            <input className="input" value={investor.cnic} onChange={(e) => update('cnic', e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={investor.status || 'ACTIVE'} onChange={(e) => update('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={investor.address} onChange={(e) => update('address', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={investor.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>
          <div className="sm:col-span-2 border-t border-gray-100 dark:border-gray-800 pt-4">
            <label className="label">Initial Investment (optional)</label>
            <input
              type="number"
              className="input"
              value={initialInvestment}
              onChange={(e) => setInitialInvestment(e.target.value)}
              placeholder="e.g. 1000000"
            />
            <p className="text-xs text-gray-400 mt-1">
              This is recorded as an INVESTMENT_IN transaction, not a static balance — you can add more investments
              or record returns anytime from the investor's dashboard.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Investor'}
          </button>
        </div>
      </form>
    </div>
  );
}
