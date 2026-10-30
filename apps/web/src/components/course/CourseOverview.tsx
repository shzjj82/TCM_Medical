import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Visit } from '../../types';
import { CourseCarousel } from './CourseCarousel';
import { CourseStageCard } from './CourseStageCard';
import { CourseStageTitle } from './CourseStageTitle';
import { CourseTimeline } from './CourseTimeline';

export function CourseOverview({
  initialDate,
  latestDate,
  initialLines,
  latestLines,
  visitTotal,
  visits,
}: {
  initialDate: string;
  latestDate: string;
  initialLines: Array<[string, string]>;
  latestLines: Array<[string, string]>;
  visitTotal: number;
  visits: Visit[];
}) {
  const [open, setOpen] = useState(true);
  const [slide, setSlide] = useState(0);
  const hasInitial = initialLines.length > 0;
  const hasLatest = latestLines.length > 0;

  const captions = useMemo(() => {
    const rows: Array<{ title: string; date?: string }> = [];
    if (hasInitial) rows.push({ title: '期初症状', date: initialDate });
    if (visits.length > 0) rows.push({ title: `经过 ${visitTotal} 次治疗` });
    if (hasLatest) rows.push({ title: '末期症状', date: latestDate });
    return rows;
  }, [hasInitial, hasLatest, initialDate, latestDate, visitTotal, visits.length]);

  const caption = captions[slide] ?? captions[0];

  return (
    <div className="shrink-0">
      <div className="hidden items-center gap-2 lg:flex">
        <Toggle open={open} onToggle={() => setOpen((value) => !value)} />
        <span className="min-w-0 items-center gap-x-3 text-sm text-slate-500 lg:flex">
          {hasInitial ? <span className="shrink-0">期初 {initialDate}</span> : null}
          {visitTotal > 0 ? <span className="shrink-0">经过 {visitTotal} 次治疗</span> : null}
          {hasLatest ? <span className="shrink-0">末期 {latestDate}</span> : null}
        </span>
      </div>
      <div className={`hidden transition-[grid-template-rows] duration-300 ease-out lg:grid ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className={`min-h-0 overflow-hidden transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
          <div className="grid items-stretch gap-4 pt-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
            {hasInitial ? <CourseStageCard title="期初症状" date={initialDate} lines={initialLines} /> : (
              <StageEmpty title="期初症状" text="暂无期初症状" />
            )}
            {visits.length > 0 ? (
              <CourseTimeline visitTotal={visitTotal} visits={visits} />
            ) : (
              <StageEmpty heading="经过 0 次治疗" text="暂无治疗记录" />
            )}
            {hasLatest ? <CourseStageCard title="末期症状" date={latestDate} lines={latestLines} /> : (
              <StageEmpty title="末期症状" text="暂无末期症状" />
            )}
          </div>
        </div>
      </div>

      <div className={`rounded-2xl bg-[#f4fbf9] lg:hidden ${open ? 'pb-1' : 'pb-3'}`}>
        <div className="flex items-center gap-2 px-4 pt-3">
          <Toggle open={open} onToggle={() => setOpen((value) => !value)} />
          {open && caption ? <CourseStageTitle title={caption.title} date={caption.date} className="ml-auto" /> : null}
        </div>
        <div className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
          <div className={`min-h-0 overflow-hidden transition-opacity duration-300 ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
            <CourseCarousel
              onIndexChange={setSlide}
              slides={[
                hasInitial ? <CourseStageCard key="initial" title="期初症状" date={initialDate} lines={initialLines} fill hideTitle embedded /> : null,
                visits.length > 0 ? (
                  <CourseTimeline
                    key="course"
                    visitTotal={visitTotal}
                    visits={visits}
                    card
                    hideTitle
                    embedded
                  />
                ) : null,
                hasLatest ? <CourseStageCard key="latest" title="末期症状" date={latestDate} lines={latestLines} fill hideTitle embedded /> : null,
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StageEmpty({ title, heading, text }: { title?: string; heading?: string; text: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-[#f4fbf9] px-4 pb-4 pt-4 lg:h-72">
      {title ? <CourseStageTitle title={title} className="shrink-0" /> : null}
      {heading ? <p className="shrink-0 text-center text-lg font-medium text-[#1a8f78]">{heading}</p> : null}
      <p className="flex flex-1 items-center justify-center text-sm text-slate-400">{text}</p>
    </div>
  );
}

function Toggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="flex h-8 shrink-0 items-center gap-1 text-sm text-[#1a8f78]"
    >
      <ChevronDown className={`h-4 w-4 shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      <span className="whitespace-nowrap font-medium">症状</span>
    </button>
  );
}
