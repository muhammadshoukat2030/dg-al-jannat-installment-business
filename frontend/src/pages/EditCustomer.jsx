import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { customerApi } from '../api/services';

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    customerApi.get(id).then((res) => setCustomer(res.data.data.customer));
  }, [id]);

  function update(field, value) {
    setCustomer((c) => ({ ...c, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await customerApi.update(id, customer);
      toast.success('Customer updated.');
      navigate(`/customers/${id}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update customer.');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Edit Customer</h1>
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input className="input" value={customer.name} onChange={(e) => update('name', e.target.value)} required />
          </div>
          <div>
            <label className="label">Contact Number *</label>
            <input className="input" value={customer.contactNumber} onChange={(e) => update('contactNumber', e.target.value)} required />
          </div>
          <div>
            <label className="label">Father Name</label>
            <input className="input" value={customer.fatherName || ''} onChange={(e) => update('fatherName', e.target.value)} />
          </div>
          <div>
            <label className="label">CNIC</label>
            <input className="input" value={customer.cnic || ''} onChange={(e) => update('cnic', e.target.value)} />
          </div>
          <div>
            <label className="label">Alternate Contact</label>
            <input className="input" value={customer.alternateContact || ''} onChange={(e) => update('alternateContact', e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={customer.city || ''} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Address</label>
            <input className="input" value={customer.address || ''} onChange={(e) => update('address', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={customer.notes || ''} onChange={(e) => update('notes', e.target.value)} />
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
