import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { WifiOff } from 'lucide-react';
import { settingsApi } from '../api/services';
import { getSettingsOffline, setSettingsOffline, enqueueOperation } from '../offline/db';
import { refreshPendingCount } from '../offline/syncManager';

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  useEffect(() => {
    // 1. Read locally available settings immediately from IndexedDB
    getSettingsOffline().then((cached) => {
      if (cached) setSettings(cached);
    });

    // 2. If online, fetch fresh settings from API and update local storage
    if (navigator.onLine) {
      settingsApi
        .get()
        .then((res) => {
          if (res.data?.data) {
            setSettings(res.data.data);
            setSettingsOffline(res.data.data);
          }
          setIsOffline(false);
        })
        .catch(() => setIsOffline(true));
    } else {
      setIsOffline(true);
    }
  }, []);

  function update(field, value) {
    setSettings((s) => ({ ...s, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);

    if (navigator.onLine) {
      try {
        const res = await settingsApi.update(settings);
        setSettings(res.data.data);
        await setSettingsOffline(res.data.data);
        toast.success('Settings saved.');
        return;
      } catch (err) {
        // Fall through to offline queue if network fails
      } finally {
        setSaving(false);
      }
    }

    // Offline save: Update IndexedDB and queue operation
    try {
      await setSettingsOffline(settings);
      await enqueueOperation({
        type: 'UPDATE_SETTINGS',
        payload: settings,
      });
      await refreshPendingCount();
      toast.success('Offline mode: Settings saved locally — will sync automatically when online.');
    } catch (offlineErr) {
      toast.error('Failed to save settings locally: ' + offlineErr.message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="p-8 text-center text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          Settings
          {isOffline && (
            <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
              <WifiOff className="w-3 h-3" /> Offline Mode
            </span>
          )}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Business / Owner Information */}
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
              <input className="input" value={settings.businessName || ''} onChange={(e) => update('businessName', e.target.value)} />
            </div>
            <div>
              <label className="label">Owner Name</label>
              <input className="input" value={settings.ownerName || ''} onChange={(e) => update('ownerName', e.target.value)} />
            </div>
            <div>
              <label className="label">Primary Phone</label>
              <input className="input" value={settings.phone || ''} onChange={(e) => update('phone', e.target.value)} />
            </div>
            <div>
              <label className="label">Secondary / Alternate Phone</label>
              <input
                className="input"
                value={settings.alternatePhone || ''}
                onChange={(e) => update('alternatePhone', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Email Address</label>
              <input className="input" type="email" value={settings.email || ''} onChange={(e) => update('email', e.target.value)} />
            </div>
            <div>
              <label className="label">City</label>
              <input className="input" value={settings.city || ''} onChange={(e) => update('city', e.target.value)} />
            </div>
            <div>
              <label className="label">Full Address / Shop Location</label>
              <input className="input" value={settings.address || ''} onChange={(e) => update('address', e.target.value)} />
            </div>
          </div>
        </div>

        {/* Currency / Regional */}
        <div className="card space-y-4">
          <div>
            <h2 className="font-semibold text-sm text-gray-500">REGIONAL & PRINTS</h2>
            <p className="text-xs text-gray-400 mt-0.5">Custom footer notes that print at the bottom of customer receipts.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Currency Code</label>
              <input className="input" value={settings.currency || 'PKR'} onChange={(e) => update('currency', e.target.value)} />
            </div>
            <div>
              <label className="label">Currency Symbol</label>
              <input className="input" value={settings.currencySymbol || 'Rs.'} onChange={(e) => update('currencySymbol', e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Print Footer Note</label>
              <textarea
                className="input"
                rows={2}
                placeholder="e.g. Computer generated receipt. Thank you for your business!"
                value={settings.footerNote || ''}
                onChange={(e) => update('footerNote', e.target.value)}
              />
            </div>
          </div>
        </div>

        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={saving}>
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
