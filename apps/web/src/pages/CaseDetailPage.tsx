import { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowLeft } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { FollowupForm } from '../components/FollowupForm';
import { PatientContrastPanel } from '../components/PatientContrastPanel';
import { VisitTimeline } from '../components/VisitTimeline';
import { api } from '../lib/api';
import type { CaseRecord, Patient } from '../types';

interface Props {
  caseKey: string;
  patientKey: string;
  onBack: () => void;
}

/** 诊断档案页：主诉 / 现病史 / 就诊方案 + 多次治疗时间轴 + 归档。 */
export function CaseDetailPage({ caseKey, patientKey, onBack }: Props) {
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [caseDetail, patientDetail] = await Promise.all([
        api.getCase(caseKey),
        api.getPatient(patientKey),
      ]);
      setRecord(caseDetail);
      setPatient(patientDetail);
    } catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }, [caseKey, patientKey]);

  useEffect(() => { void load(); }, [load]);

  async function archive() {
    setArchiving(true); setError(null);
    try {
      await api.archiveCase(caseKey);
      setConfirming(false);
      await load();
    } catch (err) { setError(String(err)); }
    finally { setArchiving(false); }
  }

  if (loading && !record) return <Card className="p-6 text-sm text-muted-foreground">加载中…</Card>;
  if (!record) return <Alert tone="danger">{error ?? '未找到该档案'}</Alert>;

  const archived = record.status === 'archived';
  const plan = record.treatmentPlan ?? {};

  /** 与后端同口径：档案就诊方案或治疗记录解析结果中，至少存在一条方案。 */
  const hasPlan =
    Boolean(String(plan.principle ?? '').trim()) ||
    (plan.acupoints?.length ?? 0) > 0 ||
    (plan.prescriptions?.length ?? 0) > 0 ||
    (plan.lifestyle?.length ?? 0) > 0 ||
    (record.visits ?? []).some((v) => {
      const parsed = (v.parsed ?? {}) as Record<string, any>;
      return (
        String(parsed.treatment_principle ?? parsed.treatmentPrinciple ?? '').trim().length > 0 ||
        (Array.isArray(parsed.acupoints) && parsed.acupoints.length > 0) ||
        (Array.isArray(parsed.prescriptions) && parsed.prescriptions.length > 0)
      );
    });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" />返回病患</Button>
        {!archived ? (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <Archive className="h-4 w-4" />归档
          </Button>
        ) : null}
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {confirming && !archived ? (
        <Alert tone="warn" title="确认归档该档案？">
          <div className="mt-2 space-y-2">
            <p>归档后档案只读，不能再添加治疗记录；档案全文（含病患信息）将沉淀到内部知识库，供 AI 建议引用。</p>
            {!hasPlan ? (
              <p className="text-destructive">
                归档要求至少一条就诊方案（治则治法 / 取穴 / 方剂 / 调摄）。当前档案尚无方案，请先在「就诊方案」中补充，或录入一次带方案的治疗。
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={archive} disabled={archiving || !hasPlan}>
                {archiving ? '归档中…' : '确认归档'}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={archiving}>取消</Button>
            </div>
          </div>
        </Alert>
      ) : null}

      {archived ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">已归档 · 只读</Badge>
          {record.archivedAt ? `归档时间：${String(record.archivedAt).slice(0, 10)}` : ''}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            第 {record.caseNo} 档案 · {record.tcmDisease ?? '未命名病'}
            {record.tcmSyndrome ? <Badge variant="accent">{record.tcmSyndrome}</Badge> : null}
            <Badge variant={archived ? 'secondary' : 'success'}>{archived ? '已归档' : '治疗中'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">主诉</p>
            <p className="mt-1 font-medium">{record.chiefComplaint}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">现病史</p>
            <p className="mt-1 leading-relaxed">{record.presentIllness || '（未填写）'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">舌象</p>
              <p className="mt-1">{record.tongue || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">脉象</p>
              <p className="mt-1">{record.pulse || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">伴随症状</p>
              <p className="mt-1">{record.symptoms.length ? record.symptoms.join('、') : '—'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>就诊方案</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">治则治法</p>
            <p className="mt-1 font-medium">{plan.principle || '—'}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">取穴</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {plan.acupoints?.length ? plan.acupoints.map((p) => (
                  <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-xs">{p}</span>
                )) : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">方剂</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {plan.prescriptions?.length ? plan.prescriptions.map((p) => (
                  <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-xs">{p}</span>
                )) : <span className="text-muted-foreground">—</span>}
              </div>
            </div>
          </div>
          {plan.lifestyle?.length ? (
            <div>
              <p className="text-xs text-muted-foreground">调摄医嘱</p>
              <p className="mt-1">{plan.lifestyle.join('、')}</p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <PatientContrastPanel
        contrast={record.contrast}
        patientName={patient?.name ?? ''}
        patientId={patient?.externalId ?? patientKey}
      />

      {!archived ? (
        <FollowupForm caseKey={record.externalId ?? record.id} onSaved={load} />
      ) : null}

      {(record.visits?.length ?? 0) > 0 ? (
        <Card>
          <CardHeader><CardTitle>治疗记录（{record.visits?.length}）</CardTitle></CardHeader>
          <CardContent><VisitTimeline visits={record.visits ?? []} /></CardContent>
        </Card>
      ) : null}
    </div>
  );
}
