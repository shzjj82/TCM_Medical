import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Mic, Plus, MessageSquare } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { FormSheet } from '../components/ui/form-sheet';
import { Scrollbar } from '../components/ui/scrollbar';
import { useTabUnderline } from '../components/ui/tabs';
import { IntakeForm } from '../components/IntakeForm';
import { api, type DashboardSummary, type DashboardVisitRow } from '../lib/api';
import { listHref } from '../lib/route';
import { greetingFor } from '../lib/session';
import { cn } from '../lib/utils';
import { toPatientBrief } from '../components/PatientBrief';
import { EmptyState } from '../components/ui/empty-state';
import { DashboardListSkeleton, Skeleton } from '../components/ui/skeleton';
import type { Patient } from '../types';

interface Props {
  userName: string;
  onOpenPatient: (key: string) => void;
  onOpenList: (href: string) => void;
  onOpenKnowledge: () => void;
  onChat: () => void;
}

const EMPTY: DashboardSummary = {
  today: { total: 0, items: [] },
  pendingReturn: { total: 0 },
  pendingFollowup: { total: 0 },
  pendingAiReview: { total: 0, items: [] },
  pendingKnowledge: { total: 0 },
  recent: { total: 0, items: [] },
};

const TABS = [
  { id: 'today', label: '今日接诊' },
  { id: 'recent', label: '最近患者' },
  { id: 'ai', label: '待审核AI' },
] as const;

type WorkbenchTab = (typeof TABS)[number]['id'];

/** 工作台：今日接诊、待办与快捷入口，数据来自已有患者和就诊记录。 */
export function DashboardPage({ userName, onOpenPatient, onOpenList, onOpenKnowledge, onChat }: Props) {
  const [data, setData] = useState<DashboardSummary>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intake, setIntake] = useState<'create' | 'voice' | null>(null);
  const [tab, setTab] = useState<WorkbenchTab>('today');
  const { barRef, indicator } = useTabUnderline(tab, '#175055');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await api.dashboard());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const greeting = greetingFor(userName);
  const counts: Record<WorkbenchTab, number> = {
    today: data.today.total,
    recent: data.recent.total,
    ai: data.pendingAiReview.total,
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="hidden shrink-0 items-start justify-between gap-3 md:flex">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">工作台</h1>
          <p className="mt-1 text-xs text-slate-400">{greeting}</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setIntake('create')}>
            <Plus className="h-4 w-4" />快速新建患者
          </Button>
          <Button variant="outline" className="border-slate-200" onClick={() => setIntake('voice')}>
            <Mic className="h-4 w-4" />快速录音
          </Button>
          <Button variant="outline" className="border-slate-200" onClick={onChat}>
            <MessageSquare className="h-4 w-4" />AI 助手
          </Button>
        </div>
      </div>

      {error ? <Alert className="mt-4 shrink-0" tone="danger">{error}</Alert> : null}

      <div className="mt-4 hidden shrink-0 grid-cols-2 gap-3 md:grid min-[1100px]:grid-cols-5">
        <StatCard label="今日接诊" value={data.today.total} loading={loading} onClick={() => onOpenList(listHref({ ...emptyQuery(), visit: 'today' }))} />
        <StatCard label="待复诊" value={data.pendingReturn.total} loading={loading} onClick={() => onOpenList(listHref({ ...emptyQuery(), view: 'overdue' }))} />
        <StatCard label="待随访" value={data.pendingFollowup.total} loading={loading} onClick={() => onOpenList(listHref({ ...emptyQuery(), view: 'followup' }))} />
        <StatCard label="待审核AI记录" value={data.pendingAiReview.total} loading={loading} />
        <StatCard label="待审核知识" value={data.pendingKnowledge.total} loading={loading} onClick={onOpenKnowledge} />
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col md:mt-4">
        <div className="flex shrink-0 items-end border-b border-slate-100">
          <div ref={barRef} className="relative flex min-w-0 flex-1 md:flex-none md:gap-6">
            {TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                data-tab={item.id}
                onClick={() => setTab(item.id)}
                className={`flex min-w-0 items-center justify-center gap-1.5 pb-2 text-sm transition-colors duration-200 md:justify-start ${
                  tab === item.id ? 'font-medium text-[#175055]' : 'text-slate-500'
                } flex-1 md:flex-none`}
              >
                {item.label}
                <CountMark value={loading ? null : counts[item.id]} alert={item.id === 'ai'} />
              </button>
            ))}
            {indicator}
          </div>
        </div>
        <Scrollbar className="min-h-0 flex-1" viewportClassName="flex min-h-full flex-col overscroll-contain">
          {tab === 'today' ? (
            <ListPanel
              loading={loading}
              empty="今日暂无接诊"
              emptyKind="empty"
              extra={data.today.total > data.today.items.length ? `共 ${data.today.total} 人` : null}
              onMore={() => onOpenList(listHref({ ...emptyQuery(), visit: 'today' }))}
            >
              {data.today.items.map((patient) => (
                <PatientRow key={patient.id} patient={patient} onOpen={onOpenPatient} />
              ))}
            </ListPanel>
          ) : null}
          {tab === 'recent' ? (
            <ListPanel
              loading={loading}
              empty="暂无最近就诊患者"
              emptyKind="empty"
              extra={data.recent.total > data.recent.items.length ? `共 ${data.recent.total} 人` : null}
              onMore={() => onOpenList(listHref({ ...emptyQuery(), view: 'recent' }))}
            >
              {data.recent.items.map((patient) => (
                <PatientRow key={patient.id} patient={patient} onOpen={onOpenPatient} />
              ))}
            </ListPanel>
          ) : null}
          {tab === 'ai' ? (
            <ListPanel
              loading={loading}
              empty="没有待审核的 AI 记录"
              emptyKind="idle"
              extra={data.pendingAiReview.total > data.pendingAiReview.items.length ? `共 ${data.pendingAiReview.total} 条` : null}
            >
              {data.pendingAiReview.items.map((row) => (
                <VisitRow key={row.id} row={row} onOpen={onOpenPatient} />
              ))}
            </ListPanel>
          ) : null}
        </Scrollbar>
      </div>

      <FormSheet
        open={Boolean(intake)}
        title={intake === 'voice' ? '快速录音 · 建立病患档案' : '快速新建患者'}
        onClose={() => setIntake(null)}
      >
        <IntakeForm
          onCreated={async () => {
            setIntake(null);
            await load();
          }}
        />
      </FormSheet>
    </div>
  );
}

function emptyQuery() {
  return { page: 1, pageSize: 10, q: '', view: '', disease: '', syndrome: '', course: '', tag: '', doctor: '', visit: '' };
}

function CountMark({ value, alert }: { value: number | null; alert?: boolean }) {
  if (value === null) return null;
  return (
    <span
      className={cn(
        'inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1.5 text-[11px] tabular-nums',
        alert && value > 0 ? 'bg-amber-100 text-amber-800' : 'bg-[#e7f4f2] text-[#175055]',
      )}
    >
      {value}
    </span>
  );
}

function StatCard({
  label, value, loading, onClick, className,
}: {
  label: string;
  value: number;
  loading: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const cardClass = cn(
    'min-w-0 rounded-2xl border border-slate-100 bg-[#f8fbfb] px-4 py-3 text-left',
    onClick ? 'transition-colors hover:border-[#c5d9d7]' : '',
    className,
  );
  const body = (
    <>
      <p className="text-xs text-slate-400">{label}</p>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-12" />
      ) : (
        <p className="mt-1 text-2xl font-semibold tabular-nums text-[#175055]">{value}</p>
      )}
    </>
  );
  if (!onClick) return <div className={cardClass}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={cardClass}>
      {body}
    </button>
  );
}

function ListPanel({
  empty, emptyKind = 'empty', extra, onMore, loading, children,
}: {
  empty: string;
  emptyKind?: 'empty' | 'idle' | 'search';
  extra?: string | null;
  onMore?: () => void;
  loading?: boolean;
  children: ReactNode;
}) {
  const rows = Array.isArray(children) ? children.filter(Boolean) : children;
  const hasRows = Array.isArray(children) ? children.length > 0 : Boolean(children);
  if (loading && !hasRows) return <DashboardListSkeleton />;
  if (!hasRows) return <EmptyState kind={emptyKind} text={empty} />;
  return (
    <div>
      <div className="divide-y divide-slate-100">{rows}</div>
      {onMore && extra ? (
        <button type="button" className="w-full py-3 text-center text-xs text-[#175055]" onClick={onMore}>
          {extra}，查看全部
        </button>
      ) : null}
    </div>
  );
}

function PatientRow({ patient, onOpen }: { patient: Patient; onOpen: (key: string) => void }) {
  const brief = toPatientBrief(patient);
  const meta = [brief.gender, brief.age].filter(Boolean).join(' ');
  return (
    <button
      type="button"
      onClick={() => onOpen(brief.key)}
      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-[#f8fbfb]"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-slate-800">
          {brief.name}
          {meta ? <span className="ml-2 text-xs text-slate-400">{meta}</span> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">
          {[brief.disease !== '—' ? brief.disease : null, brief.lastVisit !== '—' ? brief.lastVisit : null].filter(Boolean).join(' · ') || '—'}
        </span>
      </span>
      <span className="shrink-0 text-xs text-slate-400">{brief.status}</span>
    </button>
  );
}

function VisitRow({ row, onOpen }: { row: DashboardVisitRow; onOpen: (key: string) => void }) {
  const key = row.patient?.externalId ?? row.patient?.id;
  const name = row.patient?.name;
  const meta = row.patient
    ? [row.patient.gender, row.patient.age ? `${row.patient.age}岁` : ''].filter(Boolean).join(' ')
    : '';
  const kind = kindLabel(row.kind);
  return (
    <button
      type="button"
      disabled={!key}
      onClick={() => { if (key) onOpen(key); }}
      className="flex w-full items-center justify-between gap-3 py-3 text-left hover:bg-[#f8fbfb] disabled:cursor-default"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm text-slate-800">
          {name || '—'}
          {meta ? <span className="ml-2 text-xs text-slate-400">{meta}</span> : null}
        </span>
        <span className="mt-0.5 block truncate text-xs text-slate-400">
          {[kind, row.visitNo ? `第${row.visitNo}次` : null, row.date ? String(row.date).slice(0, 10) : null].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className="shrink-0 text-xs text-amber-700">待审核</span>
    </button>
  );
}

function kindLabel(kind?: string | null): string | null {
  if (kind === 'first') return '初诊';
  if (kind === 'return') return '复诊';
  if (kind === 'close') return '结案';
  if (kind === 'refer') return '转诊';
  if (kind === 'follow') return '随访';
  return null;
}
