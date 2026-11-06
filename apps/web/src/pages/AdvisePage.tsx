import { useEffect, useState, type ReactNode } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Textarea } from '../components/ui/input';
import { PatientPick, patientKeyOf } from '../components/PatientPick';
import { api } from '../lib/api';
import { soleCase } from '../lib/sole-case';
import { courseEnded } from '../lib/visit-kind';
import type { AdviseResult, CaseRecord, Patient, TreatmentPlan } from '../types';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

type Decision = 'adopted' | 'rejected' | 'edited';

interface Draft {
  principle: string;
  acupoints: string;
  prescriptions: string;
  lifestyle: string;
}

const DECISION_LABEL: Record<Decision, string> = {
  adopted: '已采纳',
  rejected: '已不采纳',
  edited: '已修改后采用',
};

function splitList(value: string): string[] {
  return value.split(/[,，、/|]+/).map((item) => item.trim()).filter(Boolean);
}

function messageOf(error: unknown): string {
  return String(error).replace(/^\d+\s*/, '').replace(/^Error:\s*/, '');
}

function draftFrom(plan: AdviseResult['plan'] | undefined): Draft {
  return {
    principle: plan?.treatmentPrinciple ?? '',
    acupoints: (plan?.acupuncturePlan ?? []).map((item) => item.point).filter(Boolean).join('、'),
    prescriptions: (plan?.herbalPlan ?? []).map((item) => item.formula).filter(Boolean).join('、'),
    lifestyle: (plan?.lifestyleAdvice ?? []).join('、'),
  };
}

function activeCaseOf(patient: Patient | null): CaseRecord | undefined {
  if (!patient) return undefined;
  const current = soleCase(patient.cases ?? []);
  if (!current) return undefined;
  const visits = (patient.visits ?? []).filter((item) => item.caseId === current.id);
  if (courseEnded(current, visits)) return undefined;
  return current;
}

/** 输入一段病人情况，联合外部参考库 + 内部资料库 + 本院医案给出建议，医生确认后可写入当前疗程。 */
export function AdvisePage() {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [detail, setDetail] = useState<Patient | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdviseResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ principle: '', acupoints: '', prescriptions: '', lifestyle: '' });
  const [snapshot, setSnapshot] = useState<Draft | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!patient) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    api.getPatient(patientKeyOf(patient)).then((row) => {
      if (!cancelled) setDetail(row);
    }).catch(() => {
      if (!cancelled) setDetail(patient);
    });
    return () => { cancelled = true; };
  }, [patient]);

  const current = activeCaseOf(detail);

  async function submit() {
    if (!text.trim()) return setError('请输入病人情况');
    setLoading(true);
    setError(null);
    setDecision(null);
    setSavedNote(null);
    setEditing(false);
    try {
      const next = await api.advise({
        text,
        patientId: patient ? patientKeyOf(patient) : undefined,
        topK: 5,
      });
      const filled = draftFrom(next.plan);
      setResult(next);
      setDraft(filled);
      setSnapshot(filled);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }

  async function decide(kind: Decision) {
    if (kind === 'edited' && !editing) {
      setEditing(true);
      setError(null);
      return;
    }
    const source = kind === 'edited' ? draft : snapshot ?? draft;
    const followNote = result?.plan?.followupPlan;
    setSaving(true);
    setError(null);
    try {
      if (current) {
        const existing = current.treatmentPlan ?? {};
        const at = new Date().toISOString();
        const treatmentPlan: TreatmentPlan = kind === 'rejected'
          ? { ...existing, aiDecision: 'rejected', aiDecidedAt: at }
          : {
            ...existing,
            principle: source.principle.trim() || undefined,
            acupoints: splitList(source.acupoints),
            prescriptions: splitList(source.prescriptions),
            lifestyle: splitList(source.lifestyle),
            followup: followNote
              ? { ...(existing.followup ?? {}), note: followNote }
              : existing.followup,
            aiDecision: kind,
            aiDecidedAt: at,
          };
        const saved = await api.updateCase(current.externalId ?? current.id, { treatmentPlan });
        setDetail((row) => row ? { ...row, cases: (row.cases ?? []).map((item) => item.id === saved.id || item.externalId === saved.externalId ? saved : item) } : row);
        setSavedNote('已写入当前疗程方案');
      } else {
        setSavedNote(patient ? '当前没有进行中的疗程，结果留在本页' : '未指定患者，结果留在本页');
      }
      setDecision(kind);
      setEditing(false);
      if (kind === 'edited') {
        setSnapshot(source);
        setResult((currentResult) => currentResult ? {
          ...currentResult,
          plan: {
            ...currentResult.plan,
            treatmentPrinciple: source.principle.trim() || undefined,
            acupuncturePlan: splitList(source.acupoints).map((point) => ({ point })),
            herbalPlan: splitList(source.prescriptions).map((formula) => ({ formula })),
            lifestyleAdvice: splitList(source.lifestyle),
          },
        } : currentResult);
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  const plan = result?.plan;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>输入病人情况，获取治疗建议</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>指定患者</Label>
            <PatientPick value={patient} onChange={setPatient} placeholder="搜索患者，指定后可写入当前疗程" />
            {patient ? (
              <p className="text-xs text-slate-400">
                {current ? `将写入「${current.tcmDisease || current.chiefComplaint || '当前疗程'}」的就诊方案` : '当前没有进行中的疗程，确认结果只会留在本页'}
              </p>
            ) : (
              <p className="text-xs text-slate-400">可不选。未指定患者时，确认结果只会留在本页。</p>
            )}
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例：女，58 岁，头晕耳鸣、腰膝酸软，血压 160/95，舌红少苔，脉弦细"
            className="min-h-[120px]"
          />
          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={loading}>
              <Sparkles className="h-4 w-4" />
              {loading ? '检索并生成中…' : '生成建议'}
            </Button>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          {result.safetyAlerts.length ? (
            <Alert tone="danger" title="安全红线：请先排除急重症">
              {result.safetyAlerts.join('、')}
            </Alert>
          ) : (
            <Alert tone="info">未命中急重症红线词，仍需常规鉴别诊断。</Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                治疗方案
                <Badge variant={result.mode === 'llm' ? 'success' : 'warning'}>
                  {result.mode === 'llm' ? 'AI 综合生成' : '资料检索草稿'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {editing ? (
                <div className="grid gap-3">
                  <Field label="治则治法">
                    <Input className={controlClass} value={draft.principle} onChange={(event) => setDraft((current) => ({ ...current, principle: event.target.value }))} />
                  </Field>
                  <Field label="取穴">
                    <Input className={controlClass} value={draft.acupoints} onChange={(event) => setDraft((current) => ({ ...current, acupoints: event.target.value }))} placeholder="用顿号或逗号分隔" />
                  </Field>
                  <Field label="方药">
                    <Input className={controlClass} value={draft.prescriptions} onChange={(event) => setDraft((current) => ({ ...current, prescriptions: event.target.value }))} placeholder="用顿号或逗号分隔" />
                  </Field>
                  <Field label="调摄医嘱">
                    <Textarea className={`${controlClass} min-h-[72px] resize-y`} rows={2} value={draft.lifestyle} onChange={(event) => setDraft((current) => ({ ...current, lifestyle: event.target.value }))} />
                  </Field>
                </div>
              ) : (
                <>
                  <p>
                    <span className="text-muted-foreground">治则治法：</span>
                    <span className="font-medium">{plan?.treatmentPrinciple ?? '—'}</span>
                  </p>
                  <div>
                    <p className="font-medium">针灸取穴</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {(plan?.acupuncturePlan ?? []).length === 0 ? <span className="text-xs text-muted-foreground">无匹配方案</span> : null}
                      {(plan?.acupuncturePlan ?? []).map((item, index) => (
                        <span key={`${item.point}-${index}`} className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs">
                          {item.point}
                          <span className="ml-1 text-muted-foreground">
                            {item.manipulation ?? ''} 留针 {item.retentionMin ?? item.retention_min ?? '—'} 分钟
                          </span>
                          <span className="ml-1 font-mono text-[10px] text-primary">[{item.source}]</span>
                        </span>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="font-medium">方药</p>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {(plan?.herbalPlan ?? []).map((item, index) => (
                        <li key={`${item.formula}-${index}`}>
                          {item.formula}
                          {item.modification ? `（${item.modification}）` : ''}
                          <span className="ml-1 font-mono text-[10px] text-primary">[{item.source}]</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {plan?.lifestyleAdvice?.length ? (
                    <div>
                      <p className="font-medium">调摄医嘱</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                        {plan.lifestyleAdvice.map((item, index) => (
                          <li key={index}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </>
              )}

              <p className="text-xs text-muted-foreground">随访安排：{plan?.followupPlan ?? '—'}</p>
              <p className="text-xs text-muted-foreground">置信度：{plan?.confidence ?? '—'}</p>

              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                <Button type="button" disabled={saving || decision === 'adopted'} onClick={() => void decide('adopted')}>
                  {saving && !editing ? '写入中…' : '采纳'}
                </Button>
                <Button type="button" variant="outline" className="border-slate-200" disabled={saving || decision === 'rejected'} onClick={() => void decide('rejected')}>
                  不采纳
                </Button>
                <Button type="button" variant="outline" className="border-slate-200" disabled={saving || decision === 'edited'} onClick={() => void decide('edited')}>
                  {editing ? (saving ? '写入中…' : '确认采用修改稿') : '修改后采用'}
                </Button>
              </div>
              {decision ? (
                <Alert tone={decision === 'rejected' ? 'warn' : 'success'}>
                  {DECISION_LABEL[decision]}。{savedNote}
                </Alert>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                证据来源
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-xs md:grid-cols-3">
              <EvidenceColumn title={`外部参考（${result.external.length}）`} rows={result.external.map((r) => String(r.title ?? r.id ?? '—'))} />
              <EvidenceColumn title={`内部资料（${result.internal.length}）`} rows={result.internal.map((r) => String(r.title ?? r.id ?? '—'))} />
              <EvidenceColumn title={`本院医案（${result.cases.length}）`} rows={result.cases.map((r) => String(r.ref ?? '—'))} />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EvidenceColumn({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {rows.length ? rows.slice(0, 6).map((row, index) => <li key={index}>· {row}</li>) : <li>无命中</li>}
      </ul>
    </div>
  );
}
