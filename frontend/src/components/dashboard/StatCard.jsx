export default function StatCard({ label, value, icon: Icon, tone = 'default' }) {
  const tones = {
    default: 'text-theme-text font-bold',
    good: 'text-[#16A34A] dark:text-[#34D399] font-bold',
    bad: 'text-[#DC2626] dark:text-[#F87171] font-bold',
    warn: 'text-[#D97706] dark:text-[#FBBF24] font-bold',
  };
  return (
    <div className="card flex items-center justify-between gap-2 min-w-0 p-3 sm:p-3.5 bg-theme-card border-theme-border hover:bg-theme-card-hover transition-colors">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] sm:text-xs text-theme-muted mb-0.5 truncate">{label}</p>
        <p className={`text-sm sm:text-base md:text-lg break-words leading-tight ${tones[tone]}`}>{value}</p>
      </div>
      {Icon && <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-theme-primary opacity-80 shrink-0 hidden xs:block" />}
    </div>
  );
}
