import { Activity, ArrowRight, CalendarDays, Sparkles } from 'lucide-react';
import type { Contrast } from '../types';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { formatPercent, pickArray, pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';

interface Props {
  contrast?: Contrast;
  patientName: string;
  patientId?: string;
}

function SeverityBar({ label, value, tone }: { label: string; value?: number; tone: 'initial' | 'latest' }) {
  const pct = Math.max(0, Math.min(10, value ?? 0)) * 10;
  const color = tone === 'initial' ? 'bg-slate-400' : 'bg-primary';
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <span className="font-semibold text-foreground">{value ?? '—'} / 10</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/**
 * 病人详情页首屏置顶的疗效总览：期初情况 → 经过 X 次治疗 → 末期情况。
 * 数据直接来自 Skill 的 contrast 结构（不可由前端自行推算，避免与后端口径不一致）。
 */
export function PatientContrastPanel({ contrast, patientName, patientId }: Props) {
  const initial = contrast?.initial ?? (contrast as any)?.initial_condition;
  const latest = contrast?.latest ?? (contrast as any)?.latest_condition;
  const visitsDone = pickNumber(contrast as Record<string, any>, 'visits_done', 'visitsDone') ?? 0;
  const treatments = pickArray(contrast as Record<string, any>, 'treatments');
  const delta = (contrast?.delta ?? {}) as Record<string, any>;
  const verdict = pickField<string>(delta, 'verdict', 'verdict') ?? '待评估';
  const improvement = pickNumber(delta, 'improvement_rate', 'improvementRate');
  const severityDelta = pickNumber(delta, 'severity_delta', 'severityDelta');
  const milestones = pickField<Array<Record<string, any>>>(contrast as Record<string, any>, 'milestones', 'milestones') ?? [];

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-card to-secondary/40 p-4 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">
            {patientName}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{patientId}</span>
          </h2>
        </div>
        <Badge variant={VERDICT_TONE[verdict] ?? 'secondary'}>
          {verdict}
          {improvement !== undefined ? ` · 改善 ${formatPercent(improvement)}` : ''}
        </Badge>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto_1fr]">
        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
          <div className="flex items-center gap-1 text-xs font-medium text-slate-600">
            <CalendarDays className="h-3.5 w-3.5" />
            期初情况
            <span className="text-muted-foreground">{pickField<string>(initial, 'date', 'date') ?? '—'}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {pickField<string>(initial, 'summary', 'summary') ?? '（未记录期初情况）'}
          </p>
          <SeverityBar label="初始严重度" value={pickNumber(initial, 'severity_score', 'severityScore')} tone="initial" />
        </div>

        <div className="flex flex-col items-center justify-center gap-1 px-2 py-1">
          <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
          <div className="rounded-full border border-primary/40 bg-card px-3 py-1 text-center shadow-sm">
            <p className="text-lg font-bold leading-none text-primary">{visitsDone}</p>
            <p className="text-[11px] text-muted-foreground">次治疗</p>
          </div>
          {treatments.length ? (
            <div className="flex max-w-[160px] flex-wrap justify-center gap-1">
              {treatments.map((t) => (
                <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1 text-xs font-medium text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            末期 / 最新情况
            <span className="text-muted-foreground">{pickField<string>(latest, 'date', 'date') ?? '—'}</span>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-foreground">
            {pickField<string>(latest, 'summary', 'summary') ?? '（尚无复诊记录）'}
          </p>
          <SeverityBar label="当前严重度" value={pickNumber(latest, 'severity_score', 'severityScore')} tone="latest" />
        </div>
      </div>

      {severityDelta !== undefined ? (
        <p className="mt-4 text-xs text-muted-foreground">
          严重度变化 <span className="font-semibold text-foreground">{severityDelta > 0 ? '+' : ''}{severityDelta}</span>
          {` · 疗效判定 ${verdict}`}
        </p>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">尚未完成严重度复评，无法给出疗效判定。</p>
      )}

      {milestones.length ? (
        <div className="mt-4 rounded-md border border-border bg-card/70 p-3">
          <p className="text-xs font-semibold text-foreground">关键转折</p>
          <ul className="mt-2 space-y-1">
            {milestones.slice(-6).map((m, index) => (
              <li key={`${pickField<string>(m, 'visit_no', 'visitNo')}-${index}`} className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  第 {pickField<string>(m, 'visit_no', 'visitNo')} 诊
                </span>
                <span className="mx-1">·</span>
                {pickField<string>(m, 'date', 'date')}
                <span className="mx-1">·</span>
                {pickField<string>(m, 'key_change', 'keyChange')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
