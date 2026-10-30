import { channelIcons, day, planOf } from '../../lib/visit-display';
import { visitLabel } from '../../lib/visit-kind';
import { Scrollbar } from '../ui/scrollbar';
import type { Visit } from '../../types';

export function CourseTimeline({
  visitTotal,
  visits,
  card = false,
  hideTitle = false,
  embedded = false,
}: {
  visitTotal: number;
  visits: Visit[];
  card?: boolean;
  hideTitle?: boolean;
  embedded?: boolean;
}) {
  if (visitTotal <= 0 && visits.length === 0) return card ? null : <div />;
  const showHeading = visitTotal > 0 && !hideTitle;
  return (
    <div className={`flex min-h-0 flex-col ${embedded ? 'h-full px-4 pb-8 pt-2' : card ? 'h-full rounded-2xl bg-[#f4fbf9] px-4 pb-8 pt-4' : `px-1 pt-2 ${visits.length ? 'lg:h-72' : ''}`}`}>
      {showHeading ? <p className="shrink-0 text-center text-lg font-medium text-[#1a8f78]">经过 {visitTotal} 次治疗</p> : null}
      {visits.length > 0 ? (
        <Scrollbar className={`min-h-0 flex-1 ${showHeading ? 'mt-3' : ''}`}>
          <ol className="relative space-y-5 pl-6">
            {visits.map((item, index) => {
              const icons = channelIcons(item.channels ?? []);
              const plan = planOf(item);
              const last = index === visits.length - 1;
              return (
                <li key={item.id} className="relative">
                  {!last ? (
                    <span aria-hidden className="absolute -left-[17px] top-4 -bottom-5 w-px bg-[#d7ebe7]" />
                  ) : null}
                  <span className="absolute -left-6 top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-[#1a8f78] bg-white">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#1a8f78]" />
                  </span>
                  <div>
                    <p className="text-sm text-slate-800">
                      <span className="font-medium">{visitLabel(item, visits)}</span>
                      <span className="ml-2 text-slate-400">{day(item.date)}</span>
                    </p>
                    {plan && plan !== '—' ? <p className="mt-1 text-sm leading-6 text-slate-600">{plan}</p> : null}
                    {icons.length > 0 ? (
                      <span className="mt-1.5 flex gap-2 text-[#1a8f78]">
                        {icons.map((Icon, i) => <Icon key={i} className="h-4 w-4" strokeWidth={1.75} />)}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        </Scrollbar>
      ) : null}
    </div>
  );
}
