export function formatCurrency(value, currency = 'PKR') {
  const num = Number(value || 0);
  return `${currency} ${num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const STATUS_STYLES = {
  PAID: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  PARTIAL: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400',
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  MISSED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400',
  OVERDUE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400',
  ACTIVE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
  COMPLETED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400',
  CANCELLED: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
};
