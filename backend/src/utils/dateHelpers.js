function addMonths(date, months) {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Guard against month-overflow (e.g. Jan 31 + 1 month => Mar 3). Clamp to last day of target month.
  if (d.getDate() !== day) {
    d.setDate(0);
  }
  return d;
}

function monthLabel(date) {
  return new Date(date).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

module.exports = { addMonths, monthLabel, startOfDay };
