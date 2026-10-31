import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { WifiOff } from 'lucide-react';
import { customerApi, planApi } from '../api/services';
import { DURATION_OPTIONS } from '../utils/durationOptions';
import FundingSourceSelector from '../components/investors/FundingSourceSelector';
import { get } from '../offline/db';

const empty = {
  productName: '',
  productDescription: '',
  purchaseCost: '',
  sellingPrice: '',
  downPayment: '',
  monthlyInstallment: '',
  customDuration: '',
  startDate: new Date().toISOString().slice(0, 10),
  firstDueDate: '',
  notes: '',
};

export default function AddInstallmentPlan() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [plan, setPlan] = useState(empty);
  const [durationChoice, setDurationChoice] = useState('10');
  const [funding, setFunding] = useState({ fundingSource: 'BUSINESS', investorId: null, capitalDeployed: 0 });
  const [saving, setSaving] = useState(false);
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  useEffect(() => {
    // 1. Immediate local-first load from IndexedDB
    get('customers', id)
      .then((cached) => {
        if (cached) setCustomer(cached);
      })
      .catch(() => {});

    // 2. Server revalidation when online
    if (navigator.onLine) {
      customerApi
        .get(id)
        .then((res) => {
          if (res.data?.data?.customer) setCustomer(res.data.data.customer);
        })
        .catch(() => {});
    }
  }, [id]);

  function update(field, value) {
    setPlan((p) => ({ ...p, [field]: value }));
  }

  const purchaseCost = Number(plan.purchaseCost) || 0;
  const sellingPrice = Number(plan.sellingPrice) || 0;
  const profit = sellingPrice - purchaseCost;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!navigator.onLine) {
      toast.error('Creating an installment contract requires an active online connection to verify capital balances and generate installment schedules.');
      return;
    }
    const duration = durationChoice === 'custom' ? Number(plan.customDuration) : Number(durationChoice);
    if (!plan.productName || !plan.purchaseCost || !plan.sellingPrice || !plan.monthlyInstallment || !duration || !plan.firstDueDate) {
      toast.error('Please complete all required fields.');
      return;
    }
    if (funding.fundingSource === 'INVESTOR') {
      if (!funding.investorId) {
        toast.error('Please select an investor.');
        return;
      }
      if (!(Number(funding.capitalDeployed) > 0)) {
        toast.error('Enter a valid amount of capital to deploy.');
        return;
      }
    }
    setSaving(true);
    try {
      await planApi.create({
        customerId: id,
        productName: plan.productName,
        productDescription: plan.productDescription,
        purchaseCost: Number(plan.purchaseCost),
        sellingPrice: Number(plan.sellingPrice),
        downPayment: Number(plan.downPayment) || 0,
        monthlyInstallment: Number(plan.monthlyInstallment),
        installmentDurationMonths: duration,
        startDate: plan.startDate,
        firstDueDate: plan.firstDueDate,
        notes: plan.notes,
        fundingSource: funding.fundingSource,
        investorId: funding.fundingSource === 'INVESTOR' ? funding.investorId : null,
        capitalDeployed: funding.fundingSource === 'INVESTOR' ? Number(funding.capitalDeployed) : 0,
      });
      toast.success('Installment contract created.');
      navigate(`/customers/${id}`);
    } catch (err) {
      // Includes the backend's insufficient-capital rejection message when applicable —
      // capital validation is authoritative on the server, never assumed from the UI.
      toast.error(err.response?.data?.message || 'Failed to create contract.');
    } finally {
      setSaving(false);
    }
  }

  if (!customer) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">New Installment Contract — {customer.name}</h1>
      {isOffline && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 px-4 py-3 rounded-xl text-xs flex items-center gap-2">
          <WifiOff className="w-4 h-4 shrink-0 text-amber-500" />
          <span>
            <strong>Offline Notice:</strong> You are currently offline. Viewing and planning contracts is available locally; final contract commitment requires an active connection to verify investor capital.
          </span>
        </div>
      )}
      <form onSubmit={handleSubmit} className="card space-y-4">
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Product Name *</label>
            <input className="input" value={plan.productName} onChange={(e) => update('productName', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Product Description</label>
            <input className="input" value={plan.productDescription} onChange={(e) => update('productDescription', e.target.value)} />
          </div>
          <div>
            <label className="label">Purchase / Cost Price *</label>
            <input type="number" className="input" value={plan.purchaseCost} onChange={(e) => update('purchaseCost', e.target.value)} />
          </div>
          <div>
            <label className="label">Selling Price *</label>
            <input type="number" className="input" value={plan.sellingPrice} onChange={(e) => update('sellingPrice', e.target.value)} />
          </div>
          <div>
            <label className="label">Down Payment</label>
            <input type="number" className="input" value={plan.downPayment} onChange={(e) => update('downPayment', e.target.value)} />
          </div>
          <div>
            <label className="label">Monthly Installment *</label>
            <input type="number" className="input" value={plan.monthlyInstallment} onChange={(e) => update('monthlyInstallment', e.target.value)} />
          </div>
          <div>
            <label className="label">Duration *</label>
            <select className="input" value={durationChoice} onChange={(e) => setDurationChoice(e.target.value)}>
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {m} Months
                </option>
              ))}
              <option value="custom">Custom Duration</option>
            </select>
          </div>
          {durationChoice === 'custom' && (
            <div>
              <label className="label">Custom Duration (months) *</label>
              <input type="number" className="input" value={plan.customDuration} onChange={(e) => update('customDuration', e.target.value)} />
            </div>
          )}
          <div>
            <label className="label">Start Date *</label>
            <input type="date" className="input" value={plan.startDate} onChange={(e) => update('startDate', e.target.value)} />
          </div>
          <div>
            <label className="label">First Due Date *</label>
            <input type="date" className="input" value={plan.firstDueDate} onChange={(e) => update('firstDueDate', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={plan.notes} onChange={(e) => update('notes', e.target.value)} />
          </div>
          {plan.purchaseCost && plan.sellingPrice && (
            <div className={`sm:col-span-2 rounded-lg p-3 text-sm ${profit >= 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30' : 'bg-red-50 text-red-700 dark:bg-red-900/30'}`}>
              {profit > 0 && `Expected Profit: PKR ${profit.toLocaleString()}`}
              {profit < 0 && `⚠ Expected Loss: PKR ${Math.abs(profit).toLocaleString()}`}
              {profit === 0 && 'Break-even contract'}
            </div>
          )}
        </div>

        <FundingSourceSelector value={funding} onChange={setFunding} suggestedAmount={purchaseCost} />

        <div className="flex justify-end gap-3 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create Contract'}
          </button>
        </div>
      </form>
    </div>
  );
}
