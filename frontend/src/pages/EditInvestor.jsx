import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { investorApi } from '../api/services';
import { get, put, enqueueOperation } from '../offline/db';
import { refreshPendingCount } from '../offline/syncManager';

export default function EditInvestor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [investor, setInvestor] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // 1. Local-first load from IndexedDB
    get('investors', id).then((local) => {
      if (local) setInvestor(local);
    }).catch(() => {});

    // 2. Server revalidation
    investorApi.get(id).then((res) => {
      if (res.data?.data?.investor) setInvestor(res.data.data.investor);
    }).catch(() => {});
  }, [id]);

  function update(field, value) {
    setInvestor((s) => ({ ...s, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      if (!navigator.onLine) {
        const operationId = 'op_upd_inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        const updated = { ...investor, _id: id, updatedAt: new Date().toISOString() };
        await put('investors', updated);
        await enqueueOperation({
          operationId,
          type: 'UPDATE_INVESTOR',
          payload: updated,
        });
        await refreshPendingCount();
        toast.success('Investor updated offline. Changes will sync automatically when online.');
        navigate(`/investors/${id}`);
        return;
      }

      await investorApi.update(id, investor);
      toast.success('Investor updated.');
      navigate(`/investors/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update investor.');
    } finally {
      setSaving(false);
    }
  }

  if (!investor) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Edit Investor</h1>
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
            <input className="input" value={investor.whatsapp || ''} onChange={(e) => update('whatsapp', e.target.value)} />
          </div>
          <div>
            <label className="label">Email</label>
            <input type="email" className="input" value={investor.email || ''} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <label className="label">CNIC / ID</label>
            <input className="input" value={investor.cnic || ''} onChange={(e) => update('cnic', e.target.value)} />
          </div>
          <div>
            <label className="label">Status</label>
            <select className="input" value={investor.status} onChange={(e) => update('status', e.target.value)}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={investor.address || ''} onChange={(e) => update('address', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={investor.notes || ''} onChange={(e) => update('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
