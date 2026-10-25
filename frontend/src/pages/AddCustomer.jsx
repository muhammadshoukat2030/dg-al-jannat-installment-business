import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { customerApi, planApi, fundingApi } from '../api/services';
import { DURATION_OPTIONS } from '../utils/durationOptions';
import MultiFundingSelector from '../components/investors/MultiFundingSelector';

const emptyCustomer = {
  name: '',
  fatherName: '',
  cnic: '',
  contactNumber: '',
  alternateContact: '',
  address: '',
  city: '',
  notes: '',
};

const emptyPlan = {
  productName: '',
  productDescription: '',
  purchaseCost: '',
  sellingPrice: '',
  downPayment: '',
  monthlyInstallment: '',
  installmentDurationMonths: '',
  customDuration: '',
  startDate: new Date().toISOString().slice(0, 10),
  firstDueDate: '',
  notes: '',
};

export default function AddCustomer() {
  const [customer, setCustomer] = useState(emptyCustomer);
  const [addPlan, setAddPlan] = useState(true);
  const [plan, setPlan] = useState(emptyPlan);
  const [durationChoice, setDurationChoice] = useState('10');

  // Multi-source funding state: { allocations: [...], isValid: bool }
  const [fundingState, setFundingState] = useState({ allocations: [], isValid: false });

  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const purchaseCost = Number(plan.purchaseCost) || 0;
  const sellingPrice = Number(plan.sellingPrice) || 0;
  const profit = sellingPrice - purchaseCost;

  function updateCustomer(field, value) {
    setCustomer((c) => ({ ...c, [field]: value }));
  }
  function updatePlan(field, value) {
    setPlan((p) => ({ ...p, [field]: value }));
  }

  // Called by MultiFundingSelector whenever allocations or validity change
  const handleFundingChange = useCallback((state) => {
    setFundingState(state);
  }, []);

  // Save button is disabled when funding is incomplete / invalid
  const fundingReady = !addPlan || fundingState.isValid;

  async function handleSubmit(e) {
    e.preventDefault();

    if (!customer.name || !customer.contactNumber) {
      toast.error('Name and contact number are required.');
      return;
    }

    let duration = null;
    if (addPlan) {
      duration = durationChoice === 'custom' ? Number(plan.customDuration) : Number(durationChoice);
      if (!plan.productName || !plan.purchaseCost || !plan.sellingPrice || !plan.monthlyInstallment || !duration || !plan.firstDueDate) {
        toast.error('Please complete all required contract fields.');
        return;
      }
      // Funding must be fully and validly allocated before submission
      if (!fundingState.isValid) {
        toast.error('Funding is not fully allocated. Total must equal Purchase Cost exactly and no allocation may exceed the source\'s available balance.');
        return;
      }
    }

    setSaving(true);
    let createdCustomer = null;
    let createdPlan = null;

    try {
      // ── Step 1: soft duplicate check ─────────────────────────────────────
      const identifier = customer.cnic || customer.contactNumber;
      if (identifier) {
        const existingRes = await customerApi.list({ search: identifier, limit: 5 });
        const possibleMatch = existingRes.data.data.find(
          (c) => (customer.cnic && c.cnic && c.cnic === customer.cnic) || c.contactNumber === customer.contactNumber
        );
        if (possibleMatch) {
          const proceed = window.confirm(
            `A customer with this ${customer.cnic && possibleMatch.cnic === customer.cnic ? 'CNIC' : 'phone number'} already exists: ${possibleMatch.name} (${possibleMatch.customerId}).\n\nClick OK to open their existing profile instead, or Cancel to create a new customer anyway (only if this is genuinely a different person).`
          );
          if (proceed) {
            navigate(`/customers/${possibleMatch._id}`);
            setSaving(false);
            return;
          }
        }
      }

      // ── Step 2: create customer ───────────────────────────────────────────
      const custRes = await customerApi.create(customer);
      createdCustomer = custRes.data.data;

      if (addPlan) {
        // ── Step 3: create plan (BUSINESS funding used as placeholder — the
        //    real multi-source allocation is written in step 4 immediately after).
        //    We pass fundingAllocations in the body so the backend knows to skip
        //    the old single-investor validation and defer to allocateFunding.
        const planRes = await planApi.create({
          customerId: createdCustomer._id,
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
          // Signal to backend that multi-source funding allocation follows
          fundingSource: 'BUSINESS',
          investorId: null,
          capitalDeployed: 0,
          skipFundingValidation: true,
        });
        createdPlan = planRes.data.data.plan;

        // ── Step 4: write multi-source funding allocations ──────────────────
        // This is the AUTHORITATIVE step. The backend re-validates each
        // source's real available balance and that the total equals purchaseCost.
        try {
          await fundingApi.allocate(createdPlan._id, fundingState.allocations);
        } catch (allocErr) {
          // Allocation failed → clean up the orphan plan so the admin can retry
          // without a dangling unfunded contract. The customer is kept so they
          // don't need to re-enter all customer data.
          try {
            await planApi.update(createdPlan._id, { status: 'CANCELLED' });
          } catch (_) { /* best-effort */ }
          const msg = allocErr.response?.data?.message || 'Funding allocation failed.';
          toast.error(`Contract saved but funding failed — contract has been cancelled. ${msg}`);
          setSaving(false);
          return;
        }
      }

      toast.success('Customer and contract saved successfully.');
      navigate(`/customers/${createdCustomer._id}`);
    } catch (err) {
      // If customer was created but plan failed, show clear message
      if (createdCustomer && !createdPlan) {
        toast.error(`Customer created but contract failed: ${err.response?.data?.message || err.message}. Go to the customer profile to add the contract.`);
        navigate(`/customers/${createdCustomer._id}`);
      } else {
        toast.error(err.response?.data?.message || 'Failed to save customer.');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Add Customer</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-gray-500">CUSTOMER INFORMATION</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Name *</label>
              <input className="input" value={customer.name} onChange={(e) => updateCustomer('name', e.target.value)} required />
            </div>
            <div>
              <label className="label">Contact Number *</label>
              <input className="input" value={customer.contactNumber} onChange={(e) => updateCustomer('contactNumber', e.target.value)} required />
            </div>
            <div>
              <label className="label">Father Name</label>
              <input className="input" value={customer.fatherName} onChange={(e) => updateCustomer('fatherName', e.target.value)} />
            </div>
            <div>
              <label className="label">CNIC</label>
              <input className="input" value={customer.cnic} onChange={(e) => updateCustomer('cnic', e.target.value)} />
            </div>
            <div>
              <label className="label">Alternate Contact</label>
              <input className="input" value={customer.alternateContact} onChange={(e) => updateCustomer('alternateContact', e.target.value)} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" value={customer.city} onChange={(e) => updateCustomer('city', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" value={customer.address} onChange={(e) => updateCustomer('address', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Notes</label>
              <textarea className="input" rows={2} value={customer.notes} onChange={(e) => updateCustomer('notes', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card space-y-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-gray-500">
            <input type="checkbox" checked={addPlan} onChange={(e) => setAddPlan(e.target.checked)} />
            CREATE INSTALLMENT CONTRACT NOW
          </label>

          {addPlan && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <label className="label">Product Name *</label>
                <input className="input" value={plan.productName} onChange={(e) => updatePlan('productName', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Product Description</label>
                <input className="input" value={plan.productDescription} onChange={(e) => updatePlan('productDescription', e.target.value)} />
              </div>
              <div>
                <label className="label">Purchase / Cost Price *</label>
                <input type="number" className="input" value={plan.purchaseCost} onChange={(e) => updatePlan('purchaseCost', e.target.value)} />
              </div>
              <div>
                <label className="label">Selling Price *</label>
                <input type="number" className="input" value={plan.sellingPrice} onChange={(e) => updatePlan('sellingPrice', e.target.value)} />
              </div>
              <div>
                <label className="label">Down Payment</label>
                <input type="number" className="input" value={plan.downPayment} onChange={(e) => updatePlan('downPayment', e.target.value)} />
              </div>
              <div>
                <label className="label">Monthly Installment *</label>
                <input type="number" className="input" value={plan.monthlyInstallment} onChange={(e) => updatePlan('monthlyInstallment', e.target.value)} />
              </div>
              <div>
                <label className="label">Duration *</label>
                <select className="input" value={durationChoice} onChange={(e) => setDurationChoice(e.target.value)}>
                  {DURATION_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m} Month{m > 1 ? 's' : ''}
                    </option>
                  ))}
                  <option value="custom">Custom Duration</option>
                </select>
              </div>
              {durationChoice === 'custom' && (
                <div>
                  <label className="label">Custom Duration (months) *</label>
                  <input type="number" className="input" value={plan.customDuration} onChange={(e) => updatePlan('customDuration', e.target.value)} />
                </div>
              )}
              <div>
                <label className="label">Start Date *</label>
                <input type="date" className="input" value={plan.startDate} onChange={(e) => updatePlan('startDate', e.target.value)} />
              </div>
              <div>
                <label className="label">First Due Date *</label>
                <input type="date" className="input" value={plan.firstDueDate} onChange={(e) => updatePlan('firstDueDate', e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Notes</label>
                <textarea className="input" rows={2} value={plan.notes} onChange={(e) => updatePlan('notes', e.target.value)} />
              </div>

              {plan.purchaseCost && plan.sellingPrice && (
                <div className={`sm:col-span-2 rounded-lg p-3 text-sm ${profit >= 0 ? 'bg-green-50 text-green-700 dark:bg-green-900/30' : 'bg-red-50 text-red-700 dark:bg-red-900/30'}`}>
                  {profit > 0 && `Expected Profit: PKR ${profit.toLocaleString()}`}
                  {profit < 0 && `⚠ Expected Loss: PKR ${Math.abs(profit).toLocaleString()}`}
                  {profit === 0 && 'Break-even contract'}
                </div>
              )}

              {/* ── Multi-source funding selector ─────────────────────────── */}
              <div className="sm:col-span-2">
                <MultiFundingSelector
                  purchaseCost={purchaseCost}
                  onChange={handleFundingChange}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 flex-wrap">
          <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving || !fundingReady}
            title={!fundingReady ? 'Funding must be fully allocated before saving.' : undefined}
          >
            {saving ? 'Saving…' : 'Save Customer'}
          </button>
        </div>

        {addPlan && !fundingReady && (
          <p className="text-xs text-orange-600 text-right">
            Save Customer is disabled until funding exactly equals Purchase Cost.
          </p>
        )}
      </form>
    </div>
  );
}
