import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { WifiOff } from 'lucide-react';
import { customerApi } from '../api/services';
import { get, getAll, put, enqueueOperation } from '../offline/db';
import { refreshPendingCount } from '../offline/syncManager';

export default function EditCustomer() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // 1. Read customer from IndexedDB immediately
    get('customers', id).then(async (cached) => {
      if (cached) {
        setCustomer(cached);
      } else {
        const all = await getAll('customers');
        const found = all.find((c) => String(c._id) === String(id) || String(c.customerId) === String(id));
        if (found) setCustomer(found);
      }
    });

    // 2. If online, fetch fresh server copy in background
    if (navigator.onLine) {
      customerApi
        .get(id)
        .then((res) => {
          if (res.data?.data?.customer) {
            setCustomer(res.data.data.customer);
            put('customers', res.data.data.customer);
          }
          setIsOffline(false);
        })
        .catch(() => setIsOffline(true));
    } else {
      setIsOffline(true);
    }
  }, [id]);

  function update(field, value) {
    setCustomer((c) => ({ ...c, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    if (navigator.onLine) {
      try {
        const res = await customerApi.update(id, customer);
        if (res.data?.data) {
          await put('customers', res.data.data);
        }
        toast.success('Customer updated.');
        navigate(`/customers/${id}`);
        return;
      } catch (err) {
        if (err.response && err.response.status >= 400 && err.response.status < 500) {
          toast.error(err.response?.data?.message || 'Failed to update customer.');
          setSaving(false);
          return;
        }
        // Fall through to offline queue
      } finally {
        setSaving(false);
      }
    }

    // Offline mode: update locally and queue operation
    try {
      const updatedCustomer = {
        ...customer,
        updatedAt: new Date().toISOString(),
        isPendingSync: true,
      };
      await put('customers', updatedCustomer);
      await enqueueOperation({
        type: 'UPDATE_CUSTOMER',
        payload: {
          ...customer,
          lastKnownUpdatedAt: customer.updatedAt,
        },
      });
      await refreshPendingCount();
      toast.success('Offline mode: Customer updated locally — will sync automatically when online.');
      navigate(`/customers/${id}`);
    } catch (offlineErr) {
      toast.error('Failed to save update locally: ' + offlineErr.message);
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <div className="p-8 text-center text-gray-400">Loading customer...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          Edit Customer
          {isOffline && (
            <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Offline Mode
            </span>
          )}
        </h1>
      </div>

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
            <label className="label">Email</label>
            <input className="input" type="email" value={customer.email || ''} onChange={(e) => update('email', e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input className="input" value={customer.city || ''} onChange={(e) => update('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Address</label>
            <input className="input" value={customer.address || ''} onChange={(e) => update('address', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={customer.notes || ''} onChange={(e) => update('notes', e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
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
