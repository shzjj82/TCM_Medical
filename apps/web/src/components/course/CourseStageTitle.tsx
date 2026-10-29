export function CourseStageTitle({
  title,
  date,
  className = '',
}: {
  title: string;
  date?: string;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="shrink-0 rounded-md bg-[#1a8f78] px-3 py-1 text-sm text-white">{title}</span>
      {date && date !== '—' ? <span className="shrink-0 text-sm text-slate-400">{date}</span> : null}
    </div>
  );
}
