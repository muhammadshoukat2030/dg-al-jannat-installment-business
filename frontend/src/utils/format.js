export function formatCurrency(value, currency = 'PKR') {
  const num = Number(value || 0);
  return `${currency} ${num.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const STATUS_STYLES = {
  PAID: 'bg-emerald-500/15 text-[#16A34A] dark:text-[#34D399] dark:bg-emerald-500/20 border border-emerald-500/30 font-medium',
  PARTIAL: 'bg-amber-500/15 text-[#D97706] dark:text-[#FBBF24] dark:bg-amber-500/20 border border-amber-500/30 font-medium',
  PENDING: 'bg-amber-500/15 text-[#D97706] dark:text-[#FBBF24] dark:bg-amber-500/20 border border-amber-500/30 font-medium',
  MISSED: 'bg-red-500/15 text-[#DC2626] dark:text-[#F87171] dark:bg-red-500/20 border border-red-500/30 font-medium',
  OVERDUE: 'bg-red-500/15 text-[#DC2626] dark:text-[#F87171] dark:bg-red-500/20 border border-red-500/30 font-medium',
  ACTIVE: 'bg-blue-500/15 text-[#2563EB] dark:text-[#60A5FA] dark:bg-blue-500/20 border border-blue-500/30 font-medium',
  COMPLETED: 'bg-emerald-500/15 text-[#16A34A] dark:text-[#34D399] dark:bg-emerald-500/20 border border-emerald-500/30 font-medium',
  CANCELLED: 'bg-gray-500/15 text-[#77718C] dark:text-[#A7BDB4] dark:bg-gray-500/20 border border-gray-500/30 font-medium',
};
