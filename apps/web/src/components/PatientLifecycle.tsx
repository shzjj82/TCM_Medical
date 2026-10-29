import { useEffect, useMemo, useState } from 'react';
import { useTabUnderline } from './ui/tabs';
import { Plus } from 'lucide-react';
import { analysisOf, channelIcons, day, followOf, linesOf, planOf, present, symptomText, text, visitSymptoms } from '../lib/visit-display';
import { EmptyState } from './ui/empty-state';
import { Scrollbar } from './ui/scrollbar';
import { kindOf, isTreatment, visitLabel, courseEnded } from '../lib/visit-kind';
import { soleCase } from '../lib/sole-case';
import { CourseOverview } from './course/CourseOverview';

import type { CaseRecord, Contrast, Patient, Visit } from '../types';

export type LifecycleAdd = 'intake' | 'return' | 'close' | 'refer' | 'follow-note';

const TABS = [
  { id: 'record', label: '病历详情' },
  { id: 'plan', label: '诊疗方案记录' },
  { id: 'exam', label: '检查报告' },
  { id: 'follow', label: '随访记录' },
  { id: 'fee', label: '费用记录' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const ADDABLE: Partial<Record<TabId, LifecycleAdd>> = {
  record: 'intake',
  plan: 'return',
  follow: 'follow-note',
};

const PLAN_ACTIONS: Array<{ id: LifecycleAdd; label: string }> = [
  { id: 'return', label: '复诊' },
  { id: 'close', label: '结案' },
  { id: 'refer', label: '转诊' },
];

export function PatientLifecycle({
  patient,
  onOpenCase,
  onAdd,
  className = '',
}: {
  patient: Patient;
  onOpenCase: (caseKey: string) => void;
  onAdd?: (action: LifecycleAdd, caseKey?: string) => void;
  className?: string;
}) {
  const current = soleCase(patient.cases ?? []);
  const visits = patient.visits ?? [];
  const [tab, setTab] = useState<TabId>('plan');
  const { barRef, indicator } = useTabUnderline(tab, '#1a8f78');
  const [expanded, setExpanded] = useState(false);
  const [planMenu, setPlanMenu] = useState(false);

  useEffect(() => { setPlanMenu(false); }, [tab, current?.id]);

  const caseVisits = useMemo(() => {
    const matched = current ? visits.filter((item) => item.caseId === current.id) : visits;
    const source = matched.length ? matched : (current ? [] : visits);
    return [...source].sort((a, b) => a.visitNo - b.visitNo || String(a.date).localeCompare(String(b.date)));
  }, [current, visits]);

  const treatmentVisits = caseVisits.filter((item) => isTreatment(kindOf(item)));
  const contrast = (current?.contrast ?? {}) as Contrast;
  const initialDate = day(contrast.initial?.date ?? patient.initialCondition?.date ?? patient.updatedAt);
  const latestDate = day(contrast.latest?.date ?? treatmentVisits[treatmentVisits.length - 1]?.date);
  const visitTotal = treatmentVisits.length;
  const initialSymptoms = symptomText([current?.chiefComplaint, ...(current?.symptoms ?? [])]);
  const latestSymptoms = visitSymptoms(treatmentVisits[treatmentVisits.length - 1]);
  const shownInitial = present([
    ['症状', initialSymptoms || '—'],
    ['舌象', text(current?.tongue) || '—'],
    ['脉象', text(current?.pulse) || '—'],
  ]);
  const shownLatest = present(caseVisits.length
    ? [
      ['摘要', text(current?.latestSummary) || '—'],
      ['症状', latestSymptoms.symptoms || '—'],
      ['舌象', latestSymptoms.tongue || '—'],
      ['脉象', latestSymptoms.pulse || '—'],
    ]
    : []);
  const showCourse = Boolean(current) && (shownInitial.length > 0 || shownLatest.length > 0 || caseVisits.length > 0);
  const shown = expanded ? caseVisits : caseVisits.slice(0, 3);
  const caseFollow = current?.treatmentPlan?.followup;
  const follows = [
    ...(caseFollow?.note || caseFollow?.date
      ? [{ id: `case-${current?.id ?? 'follow'}`, date: caseFollow.date, plan: caseFollow.note || '—' }]
      : []),
    ...caseVisits
      .filter((item) => kindOf(item) === 'follow')
      .map((item) => ({ id: item.id, date: item.date, plan: text(item.doctorNote) || followOf(item) || '—' })),
  ];
  const ended = courseEnded(current, caseVisits);
  const hasFirst = caseVisits.some((item) => kindOf(item) === 'first');
  const hasReturn = caseVisits.some((item) => kindOf(item) === 'return');
  const addTab = tab === 'record' ? (current ? undefined : 'intake') : ADDABLE[tab];
  const showAdd = Boolean(onAdd && addTab && !(addTab !== 'intake' && ended));

  return (
    <section className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-white md:rounded-2xl md:border md:border-slate-100 md:px-5 md:py-4 lg:p-5 ${className}`}>
      {showCourse ? (
        <CourseOverview
          initialDate={initialDate}
          latestDate={latestDate}
          initialLines={shownInitial}
          latestLines={shownLatest}
          visitTotal={visitTotal}
          visits={caseVisits}
          onOpen={() => current && onOpenCase(current.externalId ?? current.id)}
        />
      ) : null}

      <div className={`flex min-h-0 flex-1 flex-col ${showCourse ? 'mt-4 border-t border-slate-100 pt-2' : ''}`}>
        <div className="flex shrink-0 items-end gap-3">
          <div ref={barRef} className="relative flex min-w-0 flex-1 gap-6 overflow-x-auto">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-tab={item.id}
                onClick={() => setTab(item.id)}
                className={`shrink-0 pb-2 text-sm transition-colors duration-200 ${
                  tab === item.id ? 'text-[#1a8f78]' : 'text-slate-500'
                }`}
              >
                <span className="grid">
                  <span className={tab === item.id ? 'col-start-1 row-start-1 font-medium' : 'col-start-1 row-start-1'}>{item.label}</span>
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">{item.label}</span>
                </span>
              </button>
            ))}
            {indicator}
          </div>
          <div className="relative mb-1 hidden shrink-0 md:block">
              <button
                type="button"
                aria-hidden={showAdd ? undefined : true}
                tabIndex={showAdd ? 0 : -1}
                className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#1a8f78] hover:bg-[#f4fbf9] ${showAdd ? '' : 'invisible pointer-events-none'}`}
                onClick={() => {
                  if (!showAdd) return;
                  if (tab === 'plan') setPlanMenu((open) => !open);
                  else onAdd?.(addTab as LifecycleAdd, current?.externalId ?? current?.id);
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={1.75} />
                添加
              </button>
              {showAdd && planMenu && tab === 'plan' ? (
                <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-sm">
                  {PLAN_ACTIONS.map((item) => {
                    const enabled = !current || (item.id === 'return' ? hasFirst : hasFirst && hasReturn);
                    const hint = !hasFirst ? '请先完成初诊' : item.id !== 'return' && !hasReturn ? '请先记录复诊' : '';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={!enabled}
                        title={enabled ? undefined : hint}
                        className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-[#f4fbf9] disabled:cursor-not-allowed disabled:text-slate-300"
                        onClick={() => {
                          setPlanMenu(false);
                          onAdd?.(item.id, current?.externalId ?? current?.id);
                        }}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
          </div>
        </div>
        <Scrollbar className="min-h-0 flex-1" viewportClassName="flex min-h-full flex-col">
        {tab === 'record' ? <RecordPane record={current} /> : null}
        {tab === 'plan' ? (
          <PlanTable
            rows={shown}
            all={caseVisits}
            total={caseVisits.length}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            onOpen={current ? () => onOpenCase(current.externalId ?? current.id) : undefined}
          />
        ) : null}
        {tab === 'exam' ? <EmptyState text="暂无检查报告" kind="search" /> : null}
        {tab === 'follow' ? (
          follows.length === 0 ? <EmptyState text="暂无随访记录" kind="idle" /> : (
            <ul className="divide-y divide-slate-100">
              {follows.map((item) => (
                <li key={item.id} className="py-3 text-sm text-slate-600">
                  <span className="text-slate-400">{day(item.date)}</span>
                  <span className="ml-3">{item.plan}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {tab === 'fee' ? <EmptyState text="暂无费用记录" kind="missing" /> : null}
        </Scrollbar>
      </div>
    </section>
  );
}

function RecordPane({ record }: { record?: CaseRecord }) {
  if (!record) return <EmptyState text="暂无病历" kind="empty" />;
  const plan = record.treatmentPlan;
  const diagnosis = record.diagnosis;
  const rows = linesOf([
    ['主诉', text(record.chiefComplaint)],
    ['现病史', text(record.presentIllness)],
    ['月经生育', text(record.menstrualHistory)],
    ['起居', text(record.dailyCondition)],
    ['舌象', text(record.tongue)],
    ['脉象', text(record.pulse)],
    ['体征', text(record.signs)],
    ['西医诊断', text(diagnosis?.westernDiagnosis)],
    ['病名', text(diagnosis?.tcmDisease) || text(record.tcmDisease)],
    ['证型', text(diagnosis?.tcmSyndrome) || text(record.tcmSyndrome)],
    ['症状', (record.symptoms ?? []).filter(Boolean).join('、')],
    ['治则', text(plan?.principle)],
    ['取穴', (plan?.acupoints ?? []).join('、')],
    ['方剂', (plan?.prescriptions ?? []).join('、')],
    ['调摄', (plan?.lifestyle ?? []).join('、')],
  ]);
  if (rows.length === 0) return <EmptyState text="暂无病历详情" kind="empty" />;
  return (
    <div className="grid gap-3 py-4 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <p key={label} className="text-sm leading-6 text-slate-600">
          <span className="text-slate-400">{label}</span>
          <span className="mt-0.5 block text-slate-800">{value}</span>
        </p>
      ))}
    </div>
  );
}

function PlanTable({
  rows, all, total, expanded, onToggle, onOpen,
}: {
  rows: Visit[];
  all: Visit[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  if (total === 0) return <EmptyState text="暂无诊疗方案" kind="idle" />;
  return (
    <div>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="py-3 pr-3 font-normal">记录</th>
              <th className="py-3 pr-3 font-normal">日期</th>
              <th className="py-3 pr-3 font-normal">诊疗方案</th>
              <th className="py-3 pr-3 font-normal">上传内容</th>
              <th className="py-3 font-normal">AI解析结果</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const icons = channelIcons(item.channels ?? []);
              return (
                <tr key={item.id} className="border-t border-slate-100 text-slate-600">
                  <td className="py-3 pr-3">
                    <button type="button" className="text-[#175055]" onClick={onOpen}>{visitLabel(item, all)}</button>
                  </td>
                  <td className="py-3 pr-3 whitespace-nowrap">{day(item.date)}</td>
                  <td className="max-w-[220px] py-3 pr-3">{planOf(item)}</td>
                  <td className="py-3 pr-3">
                    <span className="flex gap-2 text-[#1a8f78]">
                      {icons.map((Icon, index) => <Icon key={index} className="h-4 w-4" strokeWidth={1.75} />)}
                    </span>
                  </td>
                  <td className="max-w-[220px] py-3">{analysisOf(item)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {total > 3 ? (
        <button type="button" onClick={onToggle} className="mx-auto mt-2 block py-2 text-sm text-[#1a8f78]">
          {expanded ? '收起' : '查看全部'}
        </button>
      ) : null}
    </div>
  );
}

