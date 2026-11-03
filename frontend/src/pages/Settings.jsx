import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  WifiOff,
  Building2,
  Database,
  ShieldCheck,
  User,
  Phone,
  PhoneCall,
  Mail,
  MapPin,
  Store,
  Coins,
  Hash,
  Printer,
  Receipt,
  FileText,
  Save,
  RefreshCw,
} from 'lucide-react';
import { settingsApi } from '../api/services';
import { getSettingsOffline, setSettingsOffline, enqueueOperation } from '../offline/db';
import { refreshPendingCount } from '../offline/syncManager';
import BackupManager from '../components/backup/BackupManager';
import DeveloperFooter from '../components/common/DeveloperFooter';

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') === 'backup' ? 'backup' : 'business';
  const [activeTab, setActiveTab] = useState(initialTab);

  const [settings, setSettings] = useState(null);
  const [saving, setSaving] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);

  // Sync tab with URL search parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'backup') {
      if (activeTab !== 'backup') setActiveTab('backup');
    } else {
      if (activeTab !== 'business') setActiveTab('business');
    }
  }, [searchParams, activeTab]);

  function switchTab(tabKey) {
    setActiveTab(tabKey);
    if (tabKey === 'backup') {
      setSearchParams({ tab: 'backup' });
    } else {
      setSearchParams({});
    }
  }

  useEffect(() => {
    // 1. Read locally available settings immediately from IndexedDB
    getSettingsOffline().then((cached) => {
      if (cached) {
        const c = { ...cached };
        if (!c.phone && c.phone1) c.phone = c.phone1;
        if (!c.alternatePhone && c.phone2) c.alternatePhone = c.phone2;
        if (!c.footerNote && c.receiptFooter) c.footerNote = c.receiptFooter;
        setSettings(c);
      }
    });

    // 2. If online, fetch fresh settings from API and update local storage
    if (navigator.onLine) {
      settingsApi
        .get()
        .then((res) => {
          if (res.data?.data) {
            const data = { ...res.data.data };
            if (!data.phone && data.phone1) data.phone = data.phone1;
            if (!data.alternatePhone && data.phone2) data.alternatePhone = data.phone2;
            if (!data.footerNote && data.receiptFooter) data.footerNote = data.receiptFooter;
            setSettings(data);
            setSettingsOffline(data);
          }
          setIsOffline(false);
        })
        .catch(() => setIsOffline(true));
    } else {
      setIsOffline(true);
    }
  }, []);

  function update(field, value) {
    setSettings((s) => {
      const next = { ...s, [field]: value };
      if (field === 'phone') next.phone1 = value;
      if (field === 'phone1') next.phone = value;
      if (field === 'alternatePhone') next.phone2 = value;
      if (field === 'phone2') next.alternatePhone = value;
      if (field === 'footerNote') next.receiptFooter = value;
      if (field === 'receiptFooter') next.footerNote = value;
      return next;
    });
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

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Top Header & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 dark:border-gray-800 pb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 text-gray-900 dark:text-gray-100">
            System Settings
            {isOffline && (
              <span className="badge bg-amber-500/10 text-amber-600 text-[11px] font-normal flex items-center gap-1">
                <WifiOff className="w-3 h-3" /> Offline Mode
              </span>
            )}
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Manage your business profile, print headers, cloud backup, and database disaster recovery.
          </p>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-2 p-1 bg-gray-100 dark:bg-gray-800/80 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => switchTab('business')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'business'
                ? 'bg-white dark:bg-gray-900 text-primary-600 dark:text-primary-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Business Profile
          </button>
          <button
            type="button"
            onClick={() => switchTab('backup')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'backup'
                ? 'bg-white dark:bg-gray-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            <Database className="w-4 h-4" />
            Database Backup & Recovery
          </button>
        </div>
      </div>

      {/* Tab 1: Business Settings */}
      {activeTab === 'business' && (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
          {!settings ? (
            <div className="card p-12 text-center text-theme-muted">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-primary-500" />
              <p className="text-sm font-medium">Loading business profile configuration...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Header Overview Banner */}
              <div className="card p-4 sm:p-5 bg-gradient-to-r from-primary-500/10 via-transparent to-transparent border-primary-500/20">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-primary-600 text-white font-bold text-base sm:text-lg flex items-center justify-center shadow-md shadow-primary-500/20 shrink-0">
                      {settings.businessName
                        ? settings.businessName
                            .split(' ')
                            .map((w) => w[0])
                            .filter(Boolean)
                            .slice(0, 2)
                            .join('')
                            .toUpperCase() || 'BP'
                        : 'BP'}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100">
                          {settings.businessName || 'Business Profile'}
                        </h2>
                        <span className="badge bg-emerald-500/10 text-emerald-600 text-[10px] font-semibold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active Business Profile
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        {settings.ownerName ? `Proprietor: ${settings.ownerName}` : 'Installment Financial Management System'}
                        {settings.city ? ` · ${settings.city}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs font-mono self-start sm:self-auto bg-white/80 dark:bg-gray-900/80 px-3 py-1.5 rounded-lg border border-gray-200/80 dark:border-gray-700/80 text-gray-700 dark:text-gray-300">
                    <Coins className="w-3.5 h-3.5 text-primary-500" />
                    <span>
                      Currency: <strong>{settings.currency || 'PKR'}</strong> ({settings.currencySymbol || 'Rs.'})
                    </span>
                  </div>
                </div>
              </div>

              {/* SECTION 1: Business & Owner Information */}
              <div className="card space-y-5 p-5 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700/80">
                <div className="flex items-start gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="w-9 h-9 rounded-lg bg-primary-500/10 dark:bg-primary-500/20 text-primary-600 dark:text-primary-400 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                      Business & Owner Information
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      This information appears on customer receipts, installment contracts, and official statements. Empty fields are omitted from print headers.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Business Name */}
                  <div className="sm:col-span-1">
                    <label className="label flex items-center justify-between">
                      <span>Business Name</span>
                      <span className="text-[10px] text-gray-400 font-normal">Header display</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-medium"
                        placeholder="e.g. DJ AL JANAT INSTALLMENT BUSINESS"
                        value={settings.businessName || ''}
                        onChange={(e) => update('businessName', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Owner Name */}
                  <div className="sm:col-span-1">
                    <label className="label flex items-center justify-between">
                      <span>Owner Name</span>
                      <span className="text-[10px] text-gray-400 font-normal">Proprietor</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-medium"
                        placeholder="e.g. Amjid Khan"
                        value={settings.ownerName || ''}
                        onChange={(e) => update('ownerName', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Primary Phone */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Primary Phone</span>
                      <span className="text-[10px] text-gray-400 font-normal">Main contact</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-mono"
                        placeholder="e.g. 0300-1234567"
                        value={settings.phone || settings.phone1 || ''}
                        onChange={(e) => update('phone', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Secondary Phone */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Secondary / Alternate Phone</span>
                      <span className="text-[10px] text-gray-400 font-normal">Optional</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <PhoneCall className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-mono"
                        placeholder="e.g. 0321-7654321"
                        value={settings.alternatePhone || settings.phone2 || ''}
                        onChange={(e) => update('alternatePhone', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Email Address */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Email Address</span>
                      <span className="text-[10px] text-gray-400 font-normal">Official</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9"
                        type="email"
                        placeholder="e.g. info@installmentbusiness.com"
                        value={settings.email || ''}
                        onChange={(e) => update('email', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* City */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>City</span>
                      <span className="text-[10px] text-gray-400 font-normal">Operational</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <MapPin className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9"
                        placeholder="e.g. Peshawar, Kohat, Lahore"
                        value={settings.city || ''}
                        onChange={(e) => update('city', e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Full Address / Shop Location */}
                  <div className="sm:col-span-2">
                    <label className="label flex items-center justify-between">
                      <span>Full Address / Shop Location</span>
                      <span className="text-[10px] text-gray-400 font-normal">Prints below business name</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Store className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9"
                        placeholder="e.g. Shop #14, Main Market, Saddar Road, Peshawar"
                        value={settings.address || ''}
                        onChange={(e) => update('address', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: Regional & Print Settings */}
              <div className="card space-y-5 p-5 sm:p-6 shadow-sm border border-gray-200 dark:border-gray-700/80">
                <div className="flex items-start gap-3 pb-3 border-b border-gray-100 dark:border-gray-800">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                    <Printer className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-gray-900 dark:text-gray-100 uppercase tracking-wide">
                      Regional & Print Settings
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      Configure accounting currency denomination and the disclaimer note printed on customer payment receipts.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Currency Code */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Currency Code</span>
                      <span className="text-[10px] text-gray-400 font-normal">ISO Code</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Coins className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-mono uppercase font-bold"
                        placeholder="PKR"
                        value={settings.currency || 'PKR'}
                        onChange={(e) => update('currency', e.target.value.toUpperCase())}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Standard currency code (e.g. PKR, USD, AED, SAR).</p>
                  </div>

                  {/* Currency Symbol */}
                  <div>
                    <label className="label flex items-center justify-between">
                      <span>Currency Symbol</span>
                      <span className="text-[10px] text-gray-400 font-normal">Display Prefix</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 dark:text-gray-500">
                        <Hash className="w-4 h-4" />
                      </div>
                      <input
                        className="input pl-9 font-bold"
                        placeholder="Rs."
                        value={settings.currencySymbol || 'Rs.'}
                        onChange={(e) => update('currencySymbol', e.target.value)}
                      />
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">Symbol prefixed on installments and vouchers (e.g. Rs., ₨, $).</p>
                  </div>

                  {/* Print Footer Note */}
                  <div className="sm:col-span-2 space-y-2">
                    <label className="label flex items-center justify-between">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <FileText className="w-3.5 h-3.5 text-primary-500" />
                        Print Footer Note
                      </span>
                      <span className="badge bg-purple-500/10 text-purple-600 dark:text-purple-400 text-[10px] font-semibold">
                        Appears at Bottom of Receipts
                      </span>
                    </label>
                    <textarea
                      className="input py-2"
                      rows={3}
                      placeholder="e.g. Computer generated receipt. Thank you for your business!"
                      value={settings.footerNote || settings.receiptFooter || ''}
                      onChange={(e) => update('footerNote', e.target.value)}
                    />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      This disclaimer or greeting note appears clearly at the bottom of every customer payment receipt.
                    </p>

                    {/* Live Receipt Footer Visual Preview Box */}
                    <div className="mt-3 p-3.5 rounded-lg bg-gray-50 dark:bg-gray-900/60 border border-dashed border-gray-300 dark:border-gray-700/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-gray-400 font-medium">
                        <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300 font-semibold">
                          <Receipt className="w-3.5 h-3.5 text-emerald-500" /> Customer Receipt Bottom Preview:
                        </span>
                        <span className="text-[10px] uppercase tracking-wider font-mono text-gray-400">Thermal / A4 Slip</span>
                      </div>
                      <div className="pt-2 border-t border-dashed border-gray-200 dark:border-gray-700 text-center font-mono text-xs text-gray-700 dark:text-gray-300 py-1.5 italic bg-white dark:bg-gray-800/60 rounded">
                        "{settings.footerNote || settings.receiptFooter || 'Computer generated receipt. Thank you for your business!'}"
                      </div>
                      <DeveloperFooter thermal={true} className="!pt-1.5 !border-t-0" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: Action Bar & Save Settings Button */}
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/40 border border-gray-200 dark:border-gray-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>
                    Settings save to the database and sync automatically across all devices & offline storage.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-md shadow-primary-500/20 active:scale-95 transition-all"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving Settings...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>Save Settings</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 2: Backup & Disaster Recovery */}
      {activeTab === 'backup' && <BackupManager />}
    </div>
  );
}
