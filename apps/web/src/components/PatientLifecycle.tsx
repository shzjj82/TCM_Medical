import { useEffect, useMemo, useState } from 'react';
import { FileText, Image as ImageIcon, Mic } from 'lucide-react';
import { pickField, pickNumber } from '../lib/coerce';
import type { CaseRecord, Contrast, Patient, Visit } from '../types';

const TABS = [
  { id: 'record', label: '病历详情' },
  { id: 'plan', label: '诊疗方案记录' },
  { id: 'exam', label: '检查报告' },
  { id: 'follow', label: '随访记录' },
  { id: 'fee', label: '费用记录' },
] as const;

type TabId = (typeof TABS)[number]['id'];

function day(value?: string): string {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function text(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!raw || raw === '（未记录）') return '';
  return raw;
}

function channelIcons(channels: string[]) {
  const joined = channels.join(' ').toLowerCase();
  const icons = [];
  if (/voice|audio|speech|语音/.test(joined)) icons.push(Mic);
  if (/image|photo|picture|ocr|舌/.test(joined)) icons.push(ImageIcon);
  if (/note|text|doc|病历|doctor/.test(joined) || icons.length === 0 && channels.length > 0) icons.push(FileText);
  return icons;
}

function analysisOf(visit: Visit): string {
  const outcome = visit.outcome ?? {};
  const parsed = visit.parsed ?? {};
  const conclusion = text(pickField<string>(outcome, 'doctor_conclusion', 'doctorConclusion'))
    || text(pickField<string>(parsed, 'narrative', 'narrative'));
  if (conclusion) return conclusion;
  const score = pickNumber(outcome, 'severity_score', 'severityScore');
  return score === undefined ? '—' : `严重度 ${score}`;
}

function planOf(visit: Visit): string {
  return text(visit.doctorNote) || '—';
}

function followOf(visit: Visit): string {
  return text(pickField<string>(visit.outcome ?? {}, 'next_plan', 'nextPlan'));
}

function linesOf(pairs: Array<[string, string]>) {
  return pairs.filter(([, value]) => value);
}

export function PatientLifecycle({
  patient,
  onOpenCase,
  onCreateCase,
}: {
  patient: Patient;
  onOpenCase: (caseKey: string) => void;
  onCreateCase: () => void;
}) {
  const cases = patient.cases ?? [];
  const visits = patient.visits ?? [];
  const [caseId, setCaseId] = useState(cases[0]?.id ?? '');
  const [tab, setTab] = useState<TabId>('plan');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!cases.some((item) => item.id === caseId)) setCaseId(cases[0]?.id ?? '');
  }, [cases, caseId]);

  const current = cases.find((item) => item.id === caseId) ?? cases[0];
  const caseVisits = useMemo(() => {
    const matched = current ? visits.filter((item) => item.caseId === current.id) : visits;
    const source = matched.length ? matched : (current ? [] : visits);
    return [...source].sort((a, b) => a.visitNo - b.visitNo || String(a.date).localeCompare(String(b.date)));
  }, [current, visits]);

  const contrast = (current?.contrast ?? {}) as Contrast;
  const initialDate = day(contrast.initial?.date ?? patient.initialCondition?.date ?? patient.updatedAt);
  const latestDate = day(contrast.latest?.date ?? caseVisits[caseVisits.length - 1]?.date);
  const visitTotal = contrast.visits_done ?? caseVisits.length;
  const initialLines = linesOf([
    ['主诉', text(current?.chiefComplaint)],
    ['现病史', text(current?.presentIllness)],
    ['症状', (current?.symptoms ?? []).filter(Boolean).join('、')],
    ['舌象', text(current?.tongue)],
    ['脉象', text(current?.pulse)],
    ['证型', text(current?.tcmSyndrome)],
    ['严重度', current?.severityScore === undefined ? '' : String(current.severityScore)],
  ]);
  const latestLines = linesOf([
    ['近况', text(contrast.latest?.summary)],
    ['严重度', contrast.latest?.severity_score === undefined && contrast.latest?.severityScore === undefined
      ? ''
      : String(contrast.latest?.severity_score ?? contrast.latest?.severityScore)],
    ['疗效', text(contrast.delta?.verdict) === '待评估' ? '' : text(contrast.delta?.verdict)],
  ]);
  const shown = expanded ? caseVisits : caseVisits.slice(0, 3);
  const follows = caseVisits
    .map((item) => ({ visit: item, plan: followOf(item) }))
    .filter((item) => item.plan);

  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-4 md:p-5">
      <div className="flex items-start gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-xl bg-[#e7f4f2] text-xl font-semibold text-[#175055]">
          {patient.name.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <h1 className="text-xl font-semibold text-slate-900">{patient.name}</h1>
                {patient.gender ? <span className="text-sm text-slate-500">{patient.gender}</span> : null}
                {patient.age ? <span className="text-sm text-slate-500">{patient.age}岁</span> : null}
              </div>
              <p className="mt-1 text-sm text-slate-500">手机号：{patient.phone?.trim() || '—'}</p>
              <p className="text-sm text-slate-500">初诊：{initialDate}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3">
              <button
                type="button"
                onClick={onCreateCase}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:border-[#c5e4df] hover:text-[#175055]"
              >
                新增档案
              </button>
              {cases.length > 0 ? (
                <div className="flex max-w-[16rem] flex-wrap justify-end gap-2">
                  {cases.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => { setCaseId(item.id); setExpanded(false); }}
                      className={`rounded-lg border px-3 py-1 text-sm ${
                        item.id === current?.id
                          ? 'border-[#175055] text-[#175055]'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {item.tcmDisease || '未命名病'}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {current ? (
        <div className="mt-8 grid items-start gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
          <StageCard title="期初情况" date={initialDate} lines={initialLines} empty="尚未记录期初情况" />
          <div className="px-1 pt-2">
            <p className="text-center text-lg font-medium text-[#1a8f78]">经过 {visitTotal} 次治疗</p>
            {caseVisits.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-400">尚未记录治疗</p>
            ) : (
              <ol className="relative mt-5 space-y-5 pl-6">
                <span className="absolute bottom-2 left-[7px] top-2 w-px bg-[#d7ebe7]" />
                {caseVisits.map((item) => {
                  const icons = channelIcons(item.channels ?? []);
                  return (
                    <li key={item.id} className="relative">
                      <span className="absolute -left-6 top-1 grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-[#1a8f78] bg-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#1a8f78]" />
                      </span>
                      <button type="button" onClick={() => onOpenCase(current.externalId ?? current.id)} className="block w-full text-left">
                        <p className="text-sm text-slate-800">
                          <span className="font-medium">第{item.visitNo}次治疗</span>
                          <span className="ml-2 text-slate-400">{day(item.date)}</span>
                        </p>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{planOf(item)}</p>
                        {icons.length > 0 ? (
                          <span className="mt-1.5 flex gap-2 text-[#1a8f78]">
                            {icons.map((Icon, index) => <Icon key={index} className="h-4 w-4" strokeWidth={1.75} />)}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          <StageCard title="末期情况" date={caseVisits.length ? latestDate : '—'} lines={caseVisits.length ? latestLines : []} empty="尚无复诊记录" />
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-400">
          暂无疾病档案。点击右上角「新增档案」后，可查看期初、治疗和末期对比。
        </p>
      )}

      <div className="mt-6 border-t border-slate-100 pt-2">
        <div className="flex gap-6 overflow-x-auto">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`shrink-0 border-b-2 pb-2 text-sm ${
                tab === item.id ? 'border-[#1a8f78] font-medium text-[#1a8f78]' : 'border-transparent text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === 'record' ? <RecordPane record={current} /> : null}
        {tab === 'plan' ? (
          <PlanTable
            rows={shown}
            total={caseVisits.length}
            expanded={expanded}
            onToggle={() => setExpanded((value) => !value)}
            onOpen={current ? () => onOpenCase(current.externalId ?? current.id) : undefined}
          />
        ) : null}
        {tab === 'exam' ? <EmptyPane text="暂无检查报告" /> : null}
        {tab === 'follow' ? (
          follows.length === 0 ? <EmptyPane text="暂无随访记录" /> : (
            <ul className="divide-y divide-slate-100">
              {follows.map((item) => (
                <li key={item.visit.id} className="py-3 text-sm text-slate-600">
                  <span className="text-slate-400">{day(item.visit.date)}</span>
                  <span className="ml-3">{item.plan}</span>
                </li>
              ))}
            </ul>
          )
        ) : null}
        {tab === 'fee' ? <EmptyPane text="暂无费用记录" /> : null}
      </div>
    </section>
  );
}

function StageCard({ title, date, lines, empty }: { title: string; date: string; lines: Array<[string, string]>; empty: string }) {
  return (
    <div className="relative rounded-2xl bg-[#f4fbf9] px-4 pb-4 pt-7">
      <span className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-md bg-[#1a8f78] px-3 py-1 text-sm text-white">{title}</span>
      <p className="text-center text-sm text-slate-400">{date}</p>
      {lines.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">{empty}</p>
      ) : (
        <div className="mt-4 space-y-2 text-sm leading-6 text-slate-600">
          {lines.map(([label, value]) => (
            <p key={label}><span className="text-slate-500">{label}：</span>{value}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function RecordPane({ record }: { record?: CaseRecord }) {
  if (!record) return <EmptyPane text="暂无病历" />;
  const plan = record.treatmentPlan;
  const rows = linesOf([
    ['主诉', text(record.chiefComplaint)],
    ['现病史', text(record.presentIllness)],
    ['病名', text(record.tcmDisease)],
    ['证型', text(record.tcmSyndrome)],
    ['症状', (record.symptoms ?? []).filter(Boolean).join('、')],
    ['舌象', text(record.tongue)],
    ['脉象', text(record.pulse)],
    ['治则', text(plan?.principle)],
    ['取穴', (plan?.acupoints ?? []).join('、')],
    ['方剂', (plan?.prescriptions ?? []).join('、')],
    ['调摄', (plan?.lifestyle ?? []).join('、')],
  ]);
  if (rows.length === 0) return <EmptyPane text="暂无病历详情" />;
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
  rows, total, expanded, onToggle, onOpen,
}: {
  rows: Visit[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  if (total === 0) return <EmptyPane text="暂无诊疗方案" />;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="text-xs text-slate-400">
              <th className="py-3 pr-3 font-normal">治疗次数</th>
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
                    <button type="button" className="text-[#175055]" onClick={onOpen}>第{item.visitNo}次</button>
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

function EmptyPane({ text: label }: { text: string }) {
  return <p className="py-10 text-center text-sm text-slate-400">{label}</p>;
}
