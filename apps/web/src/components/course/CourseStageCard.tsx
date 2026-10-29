import { Scrollbar } from '../ui/scrollbar';
import { CourseStageTitle } from './CourseStageTitle';

export function CourseStageCard({
  title,
  date,
  lines,
  fill = false,
  hideTitle = false,
  embedded = false,
}: {
  title: string;
  date: string;
  lines: Array<[string, string]>;
  fill?: boolean;
  hideTitle?: boolean;
  embedded?: boolean;
}) {
  if (!lines.length) return null;
  return (
    <div className={`flex flex-col ${embedded ? 'h-full px-4 pb-8 pt-2' : `rounded-2xl bg-[#f4fbf9] px-4 ${fill ? 'h-full pb-8 pt-4' : 'h-auto pb-4 pt-4 lg:h-72'}`}`}>
      {hideTitle ? null : <CourseStageTitle title={title} date={date} className="shrink-0 justify-between" />}
      <Scrollbar className={`${hideTitle ? '' : 'mt-3'} min-h-0 flex-1`} viewportClassName="space-y-2 text-sm leading-6 text-slate-600">
        {lines.map(([label, value]) => (
          <p key={label}><span className="text-slate-500">{label}：</span>{value}</p>
        ))}
      </Scrollbar>
    </div>
  );
}
