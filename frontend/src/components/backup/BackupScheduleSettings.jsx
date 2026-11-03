import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Clock, ShieldAlert, Save, RefreshCw } from 'lucide-react';

export default function BackupScheduleSettings({
  schedule = {},
  retention = {},
  onSave,
  saving,
}) {
  const [formData, setFormData] = useState({
    isEnabled: false,
    timezone: 'Asia/Karachi',
    daily: { enabled: true, time: '02:00' },
    weekly: { enabled: true, time: '02:00', dayOfWeek: 0 },
    monthly: { enabled: true, time: '02:00', dayOfMonth: 1 },
    dailyDays: 30,
    weeklyWeeks: 12,
    monthlyMonths: 12,
  });

  useEffect(() => {
    if (schedule || retention) {
      setFormData({
        isEnabled: !!schedule?.isEnabled,
        timezone: schedule?.timezone || 'Asia/Karachi',
        daily: schedule?.daily || { enabled: true, time: '02:00' },
        weekly: schedule?.weekly || { enabled: true, time: '02:00', dayOfWeek: 0 },
        monthly: schedule?.monthly || { enabled: true, time: '02:00', dayOfMonth: 1 },
        dailyDays: retention?.dailyDays || 30,
        weeklyWeeks: retention?.weeklyWeeks || 12,
        monthlyMonths: retention?.monthlyMonths || 12,
      });
    }
  }, [JSON.stringify(schedule), JSON.stringify(retention)]);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      await onSave({
        schedule: {
          isEnabled: formData.isEnabled,
          timezone: formData.timezone,
          daily: formData.daily,
          weekly: formData.weekly,
          monthly: formData.monthly,
        },
        retention: {
          dailyDays: Number(formData.dailyDays) || 30,
          weeklyWeeks: Number(formData.weeklyWeeks) || 12,
          monthlyMonths: Number(formData.monthlyMonths) || 12,
        },
      });
      toast.success('Backup schedule & retention settings updated.');
    } catch (err) {
      toast.error('Failed to update settings: ' + err.message);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card space-y-6">
      <div>
        <h2 className="text-sm font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
          <Clock className="w-4 h-4 text-purple-500" /> AUTOMATIC BACKUP SCHEDULING & RETENTION POLICY
        </h2>
        <p className="text-xs text-theme-muted mt-0.5">
          Configures background recurring database backups without paid services. Preferred timezone is{' '}
          <strong>Pakistan Standard Time (Asia/Karachi)</strong>.
        </p>
      </div>

      {/* Main Switch */}
      <div className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-xs font-bold text-gray-900 dark:text-gray-100">Enable Automatic Backup Scheduler</p>
          <p className="text-[11px] text-gray-500">
            Executes full database backups automatically and uploads to your connected Google Drive folder.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={formData.isEnabled}
            onChange={(e) => setFormData((d) => ({ ...d, isEnabled: e.target.checked }))}
          />
          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary-600"></div>
        </label>
      </div>

      {/* Schedule Frequencies */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Recurring Backup Schedules</h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Daily */}
          <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Daily Backup</span>
              <input
                type="checkbox"
                className="checkbox"
                checked={formData.daily.enabled}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, daily: { ...d.daily, enabled: e.target.checked } }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Execution Time (PKT)</label>
              <input
                type="time"
                className="input py-1 text-xs"
                value={formData.daily.time}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, daily: { ...d.daily, time: e.target.value } }))
                }
              />
            </div>
          </div>

          {/* Weekly */}
          <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Weekly Backup</span>
              <input
                type="checkbox"
                className="checkbox"
                checked={formData.weekly.enabled}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, weekly: { ...d.weekly, enabled: e.target.checked } }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Day of Week</label>
              <select
                className="input py-1 text-xs"
                value={formData.weekly.dayOfWeek}
                onChange={(e) =>
                  setFormData((d) => ({
                    ...d,
                    weekly: { ...d.weekly, dayOfWeek: parseInt(e.target.value, 10) },
                  }))
                }
              >
                <option value={0}>Sunday (Recommended)</option>
                <option value={1}>Monday</option>
                <option value={5}>Friday</option>
                <option value={6}>Saturday</option>
              </select>
            </div>
          </div>

          {/* Monthly */}
          <div className="p-3 border border-gray-200 dark:border-gray-700 rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">Monthly Backup</span>
              <input
                type="checkbox"
                className="checkbox"
                checked={formData.monthly.enabled}
                onChange={(e) =>
                  setFormData((d) => ({ ...d, monthly: { ...d.monthly, enabled: e.target.checked } }))
                }
              />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 block mb-1">Day of Month</label>
              <select
                className="input py-1 text-xs"
                value={formData.monthly.dayOfMonth}
                onChange={(e) =>
                  setFormData((d) => ({
                    ...d,
                    monthly: { ...d.monthly, dayOfMonth: parseInt(e.target.value, 10) },
                  }))
                }
              >
                <option value={1}>1st of every month</option>
                <option value={15}>15th of every month</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Retention Policies */}
      <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Safe Retention Policies
          </h3>
          <p className="text-[11px] text-theme-muted mt-0.5">
            Old backups beyond these thresholds are automatically cleaned. <strong>Safety Rule:</strong> The system
            will never delete the only remaining valid backup.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Keep Daily Backups For
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="365"
                className="input py-1 text-xs"
                value={formData.dailyDays}
                onChange={(e) => setFormData((d) => ({ ...d, dailyDays: e.target.value }))}
              />
              <span className="text-xs text-gray-500">Days</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Keep Weekly Backups For
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="104"
                className="input py-1 text-xs"
                value={formData.weeklyWeeks}
                onChange={(e) => setFormData((d) => ({ ...d, weeklyWeeks: e.target.value }))}
              />
              <span className="text-xs text-gray-500">Weeks</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-700 dark:text-gray-300 block mb-1">
              Keep Monthly Backups For
            </label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min="1"
                max="60"
                className="input py-1 text-xs"
                value={formData.monthlyMonths}
                onChange={(e) => setFormData((d) => ({ ...d, monthlyMonths: e.target.value }))}
              />
              <span className="text-xs text-gray-500">Months</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-3">
        <button type="submit" className="btn-primary text-xs flex items-center gap-1.5" disabled={saving}>
          {saving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Schedule & Retention Settings
        </button>
      </div>
    </form>
  );
}
