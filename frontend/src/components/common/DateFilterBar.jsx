import { useState } from 'react';

const PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom', label: 'Custom Range' },
];

/**
 * A compact date-filter bar. Calls onChange({ preset, from, to }) whenever the
 * selection changes — preset is always one of PRESETS' values; from/to are only
 * populated when preset === 'custom'. Passing { preset: 'all' } (the default)
 * means "no filter" — callers should treat that as lifetime/all-time data.
 */
export default function DateFilterBar({ onChange, className = '' }) {
  const [preset, setPreset] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  function applyPreset(value) {
    setPreset(value);
    if (value !== 'custom') {
      onChange({ preset: value });
    } else if (from && to) {
      onChange({ preset: 'custom', from, to });
    }
  }

  function applyCustom(newFrom, newTo) {
    setFrom(newFrom);
    setTo(newTo);
    if (newFrom && newTo) {
      if (newFrom > newTo) return; // invalid range — wait for a valid one before firing
      onChange({ preset: 'custom', from: newFrom, to: newTo });
    }
  }

  function clearFilter() {
    setPreset('all');
    setFrom('');
    setTo('');
    onChange({ preset: 'all' });
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <select className="input w-auto" value={preset} onChange={(e) => applyPreset(e.target.value)}>
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
      {preset === 'custom' && (
        <>
          <input type="date" className="input w-auto" value={from} onChange={(e) => applyCustom(e.target.value, to)} />
          <span className="text-gray-400 text-sm">to</span>
          <input type="date" className="input w-auto" value={to} onChange={(e) => applyCustom(from, e.target.value)} />
        </>
      )}
      {preset !== 'all' && (
        <button className="text-xs text-primary-600 hover:underline" onClick={clearFilter} type="button">
          Clear Filter
        </button>
      )}
    </div>
  );
}
