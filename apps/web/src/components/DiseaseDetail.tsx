import { useState } from 'react';
import {
  Archive, ArrowLeft, FileAudio, FileImage, FileText, Mic, Phone, Plus, Stethoscope,
} from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { FollowupForm } from './FollowupForm';
import { pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';
import type { CaseRecord, Contrast, Patient, TreatmentPlan, Visit } from '../types';

const TABS = [
  { key: 'chart', label: '病历详情' },
  { key: 'plans', label: '诊疗方案记录' },
  { key: 'labs', label: '检查报告' },
  { key: 'followups', label: '随访记录' },
  { key: 'fees', label: '费用记录' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const CHANNEL_ICON: Record<string, typeof FileText> = {
  audio: FileAudio,
  image: FileImage,
  text: FileText,
  doctor_note: Stethoscope,
};

interface Props {
  record: CaseRecord;
  patient: Patient | null;
  archived: boolean;
  hasPlan: boolean;
  onBack: () => void;
  onRequestArchive: () => void;
  onSaved: () => void | Promise<void>;
}

function day(value?: string) {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function namesOf(raw: unknown): string {
  if (!Array.isArray(raw)) return '';
  return raw
    .map((item) => (typeof item === 'string' ? item : String((item as Record<string, unknown>).name ?? '')))
    .filter(Boolean)
    .join('、');
}

function planText(visit: Visit): string {
  const parsed = visit.parsed ?? {};
  const principle = pickField<string>(parsed, 'treatment_principle', 'treatmentPrinciple');
  const points = namesOf(parsed.acupoints);
  const formulas = namesOf(parsed.prescriptions);
  const parts = [
    principle,
    points ? `取${points}` : '',
    formulas ? `方：${formulas}` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join('，');
  if (visit.doctorNote) return visit.doctorNote;
  return '—';
}

function aiText(visit: Visit): string {
  const parsed = visit.parsed ?? {};
  const narrative = pickField<string>(parsed, 'narrative', 'narrative');
  if (narrative) return narrative;
  const syndrome = pickField<string>(parsed, 'tcm_syndrome', 'tcmSyndrome');
  const principle = pickField<string>(parsed, 'treatment_principle', 'treatmentPrinciple');
  const text = [syndrome, principle].filter(Boolean).join('，');
  return text || '—';
}

function FieldLine({ label, value }: { label: string; value?: string }) {
  return (
    <p className="text-[13px] leading-6 text-slate-600">
      <span className="text-slate-400">{label}：</span>
      <span className="text-slate-800">{value || '—'}</span>
    </p>
  );
}

function EmptyHint({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-8 text-center">
      <p className="text-sm font-medium text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-400">{detail}</p>
    </div>
  );
}

/** 患者疾病详情：期初情况 → 经过 N 次治疗 → 当前/末期情况，以及方案记录。 */
export function DiseaseDetail({ record, patient, archived, hasPlan, onBack, onRequestArchive, onSaved }: Props) {
  const [tab, setTab] = useState<TabKey>('plans');
  const [adding, setAdding] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const contrast = (record.contrast ?? {}) as Contrast;
  const initial = contrast.initial;
  const latest = contrast.latest;
  const delta = (contrast.delta ?? {}) as Record<string, unknown>;
  const verdict = pickField<string>(delta, 'verdict', 'verdict');
  const visits = [...(record.visits ?? [])].sort((a, b) => a.visitNo - b.visitNo);
  const visitCount = visits.length || pickNumber(contrast as Record<string, unknown>, 'visits_done', 'visitsDone') || record.visitCount || 0;
  const latestVisit = visits[visits.length - 1];
  const plan = (record.treatmentPlan ?? {}) as TreatmentPlan;
  const visibleVisits = showAll ? visits : visits.slice(0, 3);

  const tags = Array.from(new Set([
    ...(patient?.tags ?? []),
    record.tcmDisease,
    record.tcmSyndrome,
  ].filter((tag): tag is string => Boolean(tag))));

  const initialDate = day(pickField<string>(initial, 'date', 'date') ?? record.createdAt);
  const latestDate = day(pickField<string>(latest, 'date', 'date'));
  const initialSeverity = pickNumber(initial, 'severity_score', 'severityScore') ?? record.severityScore;
  const latestSeverity = pickNumber(latest, 'severity_score', 'severityScore');
  const latestTongue = latestVisit ? pickField<string>(latestVisit.parsed ?? {}, 'tongue', 'tongue') : undefined;
  const latestPulse = latestVisit ? pickField<string>(latestVisit.parsed ?? {}, 'pulse', 'pulse') : undefined;
  const latestSummary = pickField<string>(latest, 'summary', 'summary') || record.latestSummary;

  const followups = visits
    .map((visit) => ({
      visit,
      next: pickField<string>(visit.outcome ?? {}, 'next_plan', 'nextPlan'),
    }))
    .filter((item) => item.next);

  const labItems = visits.flatMap((visit) => {
    const media = visit.raw?.media;
    const rows: Array<{ key: string; visitNo: number; date: string; label: string }> = [];
    if (Array.isArray(media)) {
      media.forEach((item, index) => {
        const label = typeof item === 'string'
          ? item
          : String((item as Record<string, unknown>)?.name ?? `附件 ${index + 1}`);
        rows.push({ key: `${visit.id}-${index}`, visitNo: visit.visitNo, date: visit.date, label });
      });
    } else if (visit.channels.includes('image')) {
      rows.push({ key: visit.id, visitNo: visit.visitNo, date: visit.date, label: '图片素材已归档' });
    }
    return rows;
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />返回患者
        </Button>
        <div className="flex items-center gap-2">
          {!archived ? (
            <Button size="sm" onClick={() => { setTab('plans'); setAdding((value) => !value); }}>
              <Plus className="h-4 w-4" />{adding ? '收起录入' : '录入治疗'}
            </Button>
          ) : null}
          {!archived ? (
            <Button size="sm" variant="outline" onClick={onRequestArchive}>
              <Archive className="h-4 w-4" />归档
            </Button>
          ) : (
            <Badge variant="secondary">已归档 · 只读</Badge>
          )}
        </div>
      </div>

      <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_8px_30px_rgba(15,60,70,0.06)]">
        <div className="flex flex-wrap items-start gap-4">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-teal-100 to-emerald-200 text-lg font-semibold text-teal-800">
            {(patient?.name ?? '患').slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold text-slate-900">{patient?.name ?? '患者'}</h1>
              <span className="text-sm text-slate-500">
                {patient?.gender || '性别未填'}
                <span className="mx-1.5 text-slate-300">·</span>
                {patient?.age ? `${patient.age} 岁` : '年龄未填'}
              </span>
              <Badge variant={archived ? 'secondary' : 'success'}>{archived ? '已结案' : '治疗中'}</Badge>
              {verdict ? <Badge variant={VERDICT_TONE[verdict] ?? 'secondary'}>{verdict}</Badge> : null}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3.5 w-3.5" />
                {patient?.phone || '手机未填'}
              </span>
              <span>初诊 {initialDate}</span>
              {record.tcmDisease ? <span>{record.tcmDisease}</span> : null}
            </p>
            {tags.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-rose-50 px-2.5 py-0.5 text-xs text-rose-600">{tag}</span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-5 grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,1fr)]">
          <article className="flex h-full flex-col rounded-xl border border-slate-100 bg-slate-50/80 p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-700">期初情况</h2>
              <span className="text-xs text-slate-400">{initialDate}</span>
            </div>
            <div className="mt-3 space-y-0.5">
              <FieldLine label="主诉" value={record.chiefComplaint} />
              <FieldLine label="症状" value={record.symptoms.length ? record.symptoms.join('、') : undefined} />
              <FieldLine label="舌象" value={record.tongue} />
              <FieldLine label="脉象" value={record.pulse} />
              <FieldLine label="严重度" value={initialSeverity !== undefined ? `${initialSeverity} / 10` : undefined} />
            </div>
            {record.presentIllness ? (
              <p className="mt-3 line-clamp-3 text-xs leading-5 text-slate-500">{record.presentIllness}</p>
            ) : null}
          </article>

          <article className="flex h-full flex-col rounded-xl border border-slate-100 bg-white p-4">
            <h2 className="text-center text-sm font-semibold text-teal-700">经过 {visitCount} 次治疗</h2>
            {visits.length === 0 ? (
              <p className="mt-6 text-center text-xs leading-5 text-slate-400">
                还没有治疗记录。录入第一次治疗后，这里会按时间展开每次方案。
              </p>
            ) : (
              <ol className="scrollbar-thin mt-4 max-h-64 space-y-4 overflow-y-auto pl-1">
                {visits.map((visit, index) => (
                  <li key={visit.id} className="relative pl-5">
                    {index < visits.length - 1 ? (
                      <span className="absolute left-[5px] top-3 h-[calc(100%+8px)] w-px bg-teal-100" />
                    ) : null}
                    <span className="absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full bg-teal-600 ring-4 ring-teal-50" />
                    <p className="text-sm font-medium text-slate-800">第 {visit.visitNo} 次治疗</p>
                    <p className="mt-0.5 text-xs text-slate-400">{day(visit.date)}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-600">{planText(visit)}</p>
                  </li>
                ))}
              </ol>
            )}
          </article>

          <article className={`flex h-full flex-col rounded-xl border p-4 ${archived ? 'border-emerald-100 bg-emerald-50/80' : 'border-teal-100 bg-teal-50/70'}`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-emerald-700">{archived ? '末期情况' : '当前情况'}</h2>
              <span className="text-xs text-emerald-700/60">{latestVisit ? latestDate : '治疗中'}</span>
            </div>
            {latestVisit ? (
              <div className="mt-3 space-y-0.5">
                <FieldLine label="舌象" value={latestTongue} />
                <FieldLine label="脉象" value={latestPulse} />
                <FieldLine label="严重度" value={latestSeverity !== undefined ? `${latestSeverity} / 10` : undefined} />
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-slate-500">尚未复诊。结案前这里显示最新情况，结案后显示末期情况。</p>
            )}
            {latestSummary ? (
              <p className="mt-3 line-clamp-4 text-xs leading-5 text-slate-600">{latestSummary}</p>
            ) : null}
          </article>
        </div>

        <div className="mt-6 border-b border-slate-100">
          <div className="scrollbar-thin flex gap-1 overflow-x-auto">
            {TABS.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`shrink-0 border-b-2 px-3 py-2 text-sm transition-colors ${
                    active
                      ? 'border-teal-600 font-medium text-teal-700'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="pt-4">
          {tab === 'chart' ? (
            <div className="grid gap-4 text-sm md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">主诉</p>
                <p className="mt-1 font-medium text-slate-800">{record.chiefComplaint}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">中医病名 / 证型</p>
                <p className="mt-1 text-slate-800">{[record.tcmDisease, record.tcmSyndrome].filter(Boolean).join(' · ') || '—'}</p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-slate-400">现病史</p>
                <p className="mt-1 leading-6 text-slate-700">{record.presentIllness || '（未填写）'}</p>
              </div>
              <FieldLine label="舌象" value={record.tongue} />
              <FieldLine label="脉象" value={record.pulse} />
              <div className="md:col-span-2 rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-500">就诊方案</p>
                <p className="mt-2 text-sm text-slate-800">{plan.principle || '尚未填写治则治法'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  取穴 {plan.acupoints?.length ? plan.acupoints.join('、') : '—'}
                  <span className="mx-2 text-slate-300">|</span>
                  方剂 {plan.prescriptions?.length ? plan.prescriptions.join('、') : '—'}
                </p>
                {plan.lifestyle?.length ? (
                  <p className="mt-1 text-xs text-slate-500">调摄 {plan.lifestyle.join('、')}</p>
                ) : null}
                {!hasPlan ? <p className="mt-2 text-xs text-amber-700">归档前需要至少一条就诊方案。</p> : null}
              </div>
            </div>
          ) : null}

          {tab === 'plans' ? (
            <div className="space-y-3">
              {adding && !archived ? (
                <FollowupForm
                  caseKey={record.externalId ?? record.id}
                  onSaved={async () => {
                    setAdding(false);
                    await onSaved();
                  }}
                />
              ) : null}
              {visits.length === 0 ? (
                <EmptyHint title="暂无诊疗方案记录" detail="点击右上角「录入治疗」，把每次取穴、方剂和医生原话记下来。" />
              ) : (
                <>
                  <div className="scrollbar-thin overflow-x-auto">
                    <table className="w-full min-w-[720px] text-left text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs text-slate-400">
                          <th className="rounded-l-lg px-3 py-2 font-medium">治疗次数</th>
                          <th className="px-3 py-2 font-medium">日期</th>
                          <th className="px-3 py-2 font-medium">诊疗方案</th>
                          <th className="px-3 py-2 font-medium">上传内容</th>
                          <th className="rounded-r-lg px-3 py-2 font-medium">AI 解析结果</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleVisits.map((visit) => (
                          <tr key={visit.id} className="border-b border-slate-100 last:border-0">
                            <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-800">第 {visit.visitNo} 次</td>
                            <td className="whitespace-nowrap px-3 py-3 text-slate-500">{day(visit.date)}</td>
                            <td className="max-w-[240px] px-3 py-3 text-slate-700">
                              <p className="line-clamp-2">{planText(visit)}</p>
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-1 text-slate-400">
                                {visit.channels.length ? visit.channels.map((channel) => {
                                  const Icon = CHANNEL_ICON[channel] ?? FileText;
                                  return <Icon key={channel} className="h-4 w-4" />;
                                }) : <Mic className="h-4 w-4 opacity-30" />}
                              </div>
                            </td>
                            <td className="max-w-[280px] px-3 py-3 text-xs leading-5 text-slate-500">
                              <p className="line-clamp-3">{aiText(visit)}</p>
                              <span className="mt-1 inline-block text-[11px] text-slate-400">
                                {visit.reviewStatus === 'pending' ? '待医师确认' : '已确认'}
                                {visit.aiMode === 'llm' ? ' · AI 解析' : visit.aiMode ? ' · 规则解析' : ''}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {visits.length > 3 ? (
                    <button
                      type="button"
                      onClick={() => setShowAll((value) => !value)}
                      className="text-xs text-teal-700 hover:underline"
                    >
                      {showAll ? '收起' : '查看全部'}
                    </button>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {tab === 'labs' ? (
            labItems.length ? (
              <ul className="space-y-2">
                {labItems.map((item) => (
                  <li key={item.key} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="text-slate-700">{item.label}</span>
                    <span className="text-xs text-slate-400">第 {item.visitNo} 次 · {day(item.date)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint title="暂无检查报告" detail="舌象、检验单等图片会在治疗记录的上传内容里汇总到这里。" />
            )
          ) : null}

          {tab === 'followups' ? (
            followups.length ? (
              <ul className="space-y-2">
                {followups.map(({ visit, next }) => (
                  <li key={visit.id} className="rounded-xl bg-slate-50 px-3 py-3 text-sm">
                    <p className="text-xs text-slate-400">第 {visit.visitNo} 次 · {day(visit.date)}</p>
                    <p className="mt-1 text-slate-700">{next}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyHint title="暂无随访记录" detail="治疗记录里填写的下次安排会显示在这里。" />
            )
          ) : null}

          {tab === 'fees' ? (
            <EmptyHint title="暂无费用记录" detail="收费明细尚未接入，这一栏先留作诊所对账使用。" />
          ) : null}
        </div>
      </section>
    </div>
  );
}
