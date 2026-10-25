const { startOfDay } = require('./dateHelpers');

/**
 * Parses a preset or custom date filter from query params into a MongoDB range
 * usable directly in a $match: { [dateField]: range }.
 *
 * Query params:
 *   preset: 'today' | 'yesterday' | 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'
 *   from, to: 'YYYY-MM-DD' (required when preset === 'custom')
 *
 * Returns null when no filter is requested (preset absent/'all') — callers should
 * treat null as "no date restriction, use lifetime totals".
 */
function parseDateFilter(query = {}) {
  const { preset, from, to } = query;
  if (!preset || preset === 'all') return null;

  const now = new Date();
  const todayStart = startOfDay(now);

  function endOfDay(date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  switch (preset) {
    case 'today':
      return { $gte: todayStart, $lte: endOfDay(now) };

    case 'yesterday': {
      const y = new Date(todayStart);
      y.setDate(y.getDate() - 1);
      return { $gte: y, $lte: endOfDay(y) };
    }

    case 'this_week': {
      const start = new Date(todayStart);
      start.setDate(start.getDate() - start.getDay());
      return { $gte: start, $lte: endOfDay(now) };
    }

    case 'last_week': {
      const thisWeekStart = new Date(todayStart);
      thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
      const lastWeekStart = new Date(thisWeekStart);
      lastWeekStart.setDate(lastWeekStart.getDate() - 7);
      const lastWeekEnd = new Date(thisWeekStart);
      lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
      return { $gte: lastWeekStart, $lte: endOfDay(lastWeekEnd) };
    }

    case 'this_month': {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { $gte: start, $lte: endOfDay(now) };
    }

    case 'last_month': {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
      return { $gte: start, $lte: endOfDay(end) };
    }

    case 'custom': {
      if (!from || !to) return null;
      const parseLocal = (str, isEnd) => {
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
          const [y, m, d] = str.split('-').map(Number);
          return isEnd ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
        }
        const dt = new Date(str);
        return isEnd ? endOfDay(dt) : startOfDay(dt);
      };
      const fromDate = parseLocal(from, false);
      const toDate = parseLocal(to, true);
      if (fromDate > toDate) return null; // invalid range — caller treats as no filter
      return { $gte: fromDate, $lte: toDate };
    }

    default:
      return null;
  }
}

module.exports = { parseDateFilter };
