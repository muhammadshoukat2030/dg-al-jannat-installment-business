import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { settingsApi } from '../api/services';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    settingsApi.get().then((res) => setSettings(res.data.data));
  }, []);

  function update(field, value) {
    setSettings((s) => ({ ...s, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await settingsApi.update(settings);
      setSettings(res.data.data);
      toast.success('Settings saved.');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold">Settings</h1>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business / Owner Information — this is what appears on every printed PDF header */}
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-sm text-gray-500">BUSINESS / OWNER INFORMATION</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              This appears at the top of every printed report, receipt, and customer record. Only fields you fill in
              are shown — leave a field blank to omit it from the print header.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Business Name</label>
              <input className="input" value={settings.businessName} onChange={(e) => update('businessName', e.target.value)} />
            </div>
            <div>
              <label className="label">Owner Name</label>
              <input className="input" value={settings.ownerName} onChange={(e) => update('ownerName', e.target.value)} />
            </div>
            <div>
              <label className="label">Website</label>
              <input className="input" value={settings.website || ''} onChange={(e) => update('website', e.target.value)} placeholder="www.example.com" />
            </div>
            <div>
              <label className="label">Phone 1</label>
              <input className="input" value={settings.phone1} onChange={(e) => update('phone1', e.target.value)} />
            </div>
            <div>
              <label className="label">Phone 2</label>
              <input className="input" value={settings.phone2} onChange={(e) => update('phone2', e.target.value)} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" value={settings.whatsapp || ''} onChange={(e) => update('whatsapp', e.target.value)} placeholder="+92 3XX XXXXXXX" />
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={settings.email || ''} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Address</label>
              <input className="input" value={settings.address} onChange={(e) => update('address', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Business Description</label>
              <textarea className="input" rows={2} value={settings.description || ''} onChange={(e) => update('description', e.target.value)} />
            </div>
          </div>
        </div>

        {/* System Settings */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-gray-500">SYSTEM SETTINGS</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Currency</label>
              <input className="input" value={settings.currency} onChange={(e) => update('currency', e.target.value)} />
            </div>
            <div>
              <label className="label">Timezone</label>
              <input className="input" value={settings.timezone} onChange={(e) => update('timezone', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Print Settings */}
        <div className="card space-y-4">
          <h2 className="font-semibold text-sm text-gray-500">PRINT SETTINGS</h2>
          <div>
            <label className="label">Receipt Footer</label>
            <textarea className="input" rows={2} value={settings.receiptFooter} onChange={(e) => update('receiptFooter', e.target.value)} />
          </div>
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={settings.showProfitOnReceipt}
              onChange={(e) => update('showProfitOnReceipt', e.target.checked)}
            />
            <label className="text-sm">Show profit/cost information on customer receipts (private data — off by default)</label>
          </div>
        </div>

        {/* Account Settings — informational; a single-admin system has no user management */}
        <div className="card space-y-2">
          <h2 className="font-semibold text-sm text-gray-500">ACCOUNT SETTINGS</h2>
          <p className="text-sm text-gray-500">
            This is a single-admin system — there is no multi-user management. To change your login email or
            password, update the admin credentials in the backend environment configuration and re-run the setup
            script (see README).
          </p>
        </div>

        <div className="flex justify-end">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
