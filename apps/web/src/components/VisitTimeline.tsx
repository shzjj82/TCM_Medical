import { FileAudio, FileImage, FileText, Stethoscope } from 'lucide-react';
import type { Visit } from '../types';
import { Badge } from './ui/badge';
import { Card } from './ui/card';
import { pickArray, pickField } from '../lib/coerce';

const CHANNEL_META: Record<string, { label: string; icon: typeof FileText }> = {
  audio: { label: '语音', icon: FileAudio },
  image: { label: '图片', icon: FileImage },
  text: { label: '文字', icon: FileText },
  doctor_note: { label: '医生批注', icon: Stethoscope },
  empty: { label: '无素材', icon: FileText },
};

function acupointLabel(visit: Visit): string {
  const points = pickArray(visit.parsed ?? {}, 'acupoints');
  const names = points.map((p) => (typeof p === 'string' ? p : String((p as Record<string, any>).name ?? ''))).filter(Boolean);
  return names.length ? names.join('、') : '—';
}

function prescriptionLabel(visit: Visit): string {
  const list = pickArray(visit.parsed ?? {}, 'prescriptions');
  const names = list.map((p) => (typeof p === 'string' ? p : String((p as Record<string, any>).name ?? ''))).filter(Boolean);
  return names.length ? names.join('、') : '—';
}

export function VisitTimeline({ visits }: { visits: Visit[] }) {
  if (!visits.length) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        暂无复诊记录。可通过「录入跟进」提交语音录音、舌苔/处方图片或文字描述。
      </Card>
    );
  }

  return (
    <ol className="space-y-4">
      {[...visits].reverse().map((visit) => {
        const changes = (visit.outcome?.symptom_changes ?? visit.outcome?.symptomChanges ?? {}) as Record<string, string>;
        const severity = pickField<number>(visit.outcome as Record<string, any>, 'severity_score', 'severityScore');
        return (
          <li key={visit.id} className="relative border-l-2 border-primary/20 pl-4">
            <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">第 {visit.visitNo} 诊</span>
                  <span className="text-xs text-muted-foreground">{visit.date}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {visit.channels.map((channel) => {
                    const meta = CHANNEL_META[channel] ?? CHANNEL_META.text;
                    const Icon = meta.icon;
                    return (
                      <Badge key={channel} variant="outline" className="gap-1">
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                    );
                  })}
                  <Badge variant={visit.aiMode === 'llm' ? 'success' : 'warning'}>
                    {visit.aiMode === 'llm' ? 'AI 解析' : '规则解析'}
                  </Badge>
                  {visit.reviewStatus === 'pending' ? (
                    <Badge variant="warning">待医师确认</Badge>
                  ) : (
                    <Badge variant="success">已确认</Badge>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid gap-2 text-sm md:grid-cols-2">
                <Field label="治则治法" value={pickField<string>(visit.parsed ?? {}, 'treatment_principle', 'treatmentPrinciple')} />
                <Field label="辨证" value={pickField<string>(visit.parsed ?? {}, 'tcm_syndrome', 'tcmSyndrome')} />
                <Field label="取穴" value={acupointLabel(visit)} />
                <Field label="方剂" value={prescriptionLabel(visit)} />
                <Field label="严重度" value={severity !== undefined ? `${severity} / 10` : undefined} />
                <Field label="下次安排" value={pickField<string>(visit.outcome ?? {}, 'next_plan', 'nextPlan')} />
              </dl>

              {visit.doctorNote ? (
                <p className="mt-4 rounded-md bg-secondary/70 p-3 text-xs leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">医生原文：</span>
                  {visit.doctorNote}
                </p>
              ) : null}

              {Object.keys(changes).length ? (
                <div className="mt-4 flex flex-wrap gap-1">
                  {Object.entries(changes).map(([key, value]) => (
                    <Badge key={key} variant="accent">
                      {key}：{String(value)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </Card>
          </li>
        );
      })}
    </ol>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm text-foreground">{value || '—'}</dd>
    </div>
  );
}
