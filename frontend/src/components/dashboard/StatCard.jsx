export default function StatCard({ label, value, icon: Icon, tone = 'default' }) {
  const tones = {
    default: 'text-gray-900 dark:text-gray-100',
    good: 'text-green-600 dark:text-green-400',
    bad: 'text-red-600 dark:text-red-400',
    warn: 'text-orange-600 dark:text-orange-400',
  };
  return (
    <div className="card flex items-center justify-between gap-2 min-w-0">
      <div className="min-w-0">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 truncate">{label}</p>
        <p className={`text-base sm:text-xl font-semibold break-words ${tones[tone]}`}>{value}</p>
      </div>
      {Icon && <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-primary-500 opacity-70 shrink-0 hidden xs:block" />}
    </div>
  );
}
