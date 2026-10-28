import { IdCard } from 'lucide-react';
import { pickField } from '../lib/coerce';
import type { CaseRecord, Patient } from '../types';

const STATUS_STYLE: Record<string, string> = {
  治疗中: 'bg-[#e7f4f2] text-[#175055]',
  已结案: 'bg-slate-100 text-slate-500',
  待建档: 'bg-amber-50 text-amber-700',
  暂停: 'bg-slate-100 text-slate-500',
};

const RISK_WORDS = ['孕妇', '妊娠', '出血', '急症', '禁忌', '晕厥'];

export interface PatientBriefData {
  key: string;
  name: string;
  gender?: string;
  age?: string;
  phone: string;
  code: string;
  disease: string;
  syndrome: string;
  doctor: string;
  visits: string;
  status: string;
  lastVisit: string;
  nextFollowup: string;
  risk: string;
}

function text(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function day(value?: string): string {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

function mockCode(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 33 + char.charCodeAt(0)) >>> 0;
  return `HZ${String((hash % 9000) + 1000)}`;
}

function resolveLatest(patient: Patient): CaseRecord | undefined {
  if (patient.latestCase) return patient.latestCase;
  const cases = patient.cases ?? [];
  if (!cases.length) return undefined;
  const active = cases.filter((item) => item.status !== 'archived');
  const pool = active.length ? active : cases;
  return [...pool].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
}

export function toPatientBrief(patient: Patient): PatientBriefData {
  const latest = resolveLatest(patient);
  const contrast = (latest?.contrast ?? {}) as Record<string, unknown>;
  const latestCondition = (contrast.latest ?? contrast.initial) as Record<string, unknown> | undefined;
  const lastVisit = pickField<string>(latestCondition, 'date', 'date') ?? latest?.updatedAt;
  const visits = latest?.visitCount ?? patient.visitCount;
  const riskHits = (patient.tags ?? []).filter((tag) => RISK_WORDS.some((word) => tag.includes(word)));
  let status = '治疗中';
  if (patient.status === 'closed' || latest?.status === 'archived') status = '已结案';
  else if (patient.status === 'paused') status = '暂停';
  else if (!latest) status = '待建档';
  return {
    key: patient.externalId ?? patient.id,
    name: patient.name,
    gender: patient.gender || undefined,
    age: patient.age ? `${patient.age} 岁` : undefined,
    phone: text(patient.phone),
    code: patient.externalId || mockCode(patient.id),
    disease: text(latest?.tcmDisease),
    syndrome: text(latest?.tcmSyndrome),
    doctor: patient.doctor?.trim() || '—',
    visits: String(visits ?? 0),
    status,
    lastVisit: day(lastVisit),
    nextFollowup: '—',
    risk: riskHits.length ? riskHits.join('、') : '—',
  };
}

function Tag({ children, warn, className = '' }: { children: string; warn?: boolean; className?: string }) {
  if (!children || children === '—') return null;
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs ${warn ? 'bg-rose-50 text-rose-600' : 'bg-white text-slate-600 ring-1 ring-slate-200'} ${className}`}>
      {children}
    </span>
  );
}

export function PatientBrief({
  data,
  onClick,
}: {
  data: PatientBriefData;
  onClick?: () => void;
}) {
  const visits = data.visits === '—' ? '—' : `${data.visits} 次`;
  const className = 'flex w-full items-center gap-4 rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left';
  const body = (
    <>
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[#e7f4f2] text-xl font-semibold text-[#175055]">
        {data.name.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-base font-semibold text-slate-900">{data.name}</span>
          {data.gender ? <span className="shrink-0 text-sm text-slate-500">{data.gender}</span> : null}
          {data.age ? <span className="shrink-0 text-sm text-slate-500">{data.age}</span> : null}
        </span>
        <span className="mt-1 block truncate text-xs text-slate-500">手机号：{data.phone}</span>
        <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
          <span className="inline-flex min-w-0 items-center gap-1">
            <IdCard className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="truncate">{data.code}</span>
          </span>
          <span className="truncate">最近就诊：{data.lastVisit}</span>
          <span className="hidden truncate lg:inline">下次随访：{data.nextFollowup}</span>
          {data.doctor !== '—' ? <span className="hidden truncate lg:inline">{data.doctor}</span> : null}
          <span className="hidden truncate md:inline">已治疗 {visits}</span>
        </span>
      </span>
      <span className="flex min-w-0 shrink flex-col items-end gap-2">
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${STATUS_STYLE[data.status] ?? 'bg-slate-100 text-slate-500'}`}>
          {data.status}
        </span>
        <span className="flex flex-wrap justify-end gap-1.5">
          <Tag>{data.disease}</Tag>
          <Tag className="hidden lg:inline-flex">{data.syndrome}</Tag>
          <Tag className="hidden xl:inline-flex" warn>{data.risk}</Tag>
        </span>
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} hover:border-[#c5e4df]`}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}
