import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { FollowupForm } from '../components/FollowupForm';
import { PatientContrastPanel } from '../components/PatientContrastPanel';
import { VisitTimeline } from '../components/VisitTimeline';
import { api } from '../lib/api';
import type { AdviseResult, Patient } from '../types';

interface Props {
  patientKey: string;
  onBack: () => void;
  onAdvise: (patientKey: string) => void;
}

export function PatientDetailPage({ patientKey, onBack, onAdvise }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [advice, setAdvice] = useState<AdviseResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [advising, setAdvising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPatient(await api.getPatient(patientKey));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [patientKey]);

  useEffect(() => {
    void load();
  }, [load]);

  async function requestAdvice() {
    setAdvising(true);
    try {
      setAdvice(await api.advise({ patientId: patientKey, topK: 5 }));
    } catch (err) {
      setError(String(err));
    } finally {
      setAdvising(false);
    }
  }

  if (loading && !patient) return <Card className="p-6 text-sm text-muted-foreground">加载中…</Card>;
  if (!patient) return <Alert tone="danger">{error ?? '未找到该病人'}</Alert>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          返回列表
        </Button>
        <Button size="sm" variant="accent" onClick={requestAdvice} disabled={advising}>
          <Sparkles className="h-4 w-4" />
          {advising ? '生成中…' : '生成治疗建议'}
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <PatientContrastPanel
        contrast={patient.contrast}
        patientName={patient.name}
        patientId={patient.externalId ?? patient.id}
      />

      {advice ? <AdviceCard advice={advice} /> : null}

      <FollowupForm patientKey={patient.externalId ?? patient.id} onSaved={load} />

      <Card>
        <CardHeader>
          <CardTitle>诊疗时间轴</CardTitle>
        </CardHeader>
        <CardContent>
          <VisitTimeline visits={patient.visits ?? []} />
        </CardContent>
      </Card>
    </div>
  );
}

function AdviceCard({ advice }: { advice: AdviseResult }) {
  if (advice.safetyAlerts.length) {
    return (
      <Alert tone="danger" title="安全红线警示">
        {advice.safetyAlerts.join('、')} —— 请先排除急重症，必要时转诊，不要仅凭中医保守方案处理。
      </Alert>
    );
  }
  const plan = advice.plan ?? {};
  return (
    <Card className="border-accent/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          治疗建议
          <Badge variant={advice.mode === 'llm' ? 'success' : 'warning'}>
            {advice.mode === 'llm' ? 'AI 综合生成' : '资料检索草稿'}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          治则治法：<span className="font-medium text-foreground">{plan.treatmentPrinciple ?? '—'}</span>
        </p>
        {plan.acupuncturePlan?.length ? (
          <div>
            <p className="font-medium">针灸取穴</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {plan.acupuncturePlan.map((item, index) => (
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
        ) : null}
        {plan.herbalPlan?.length ? (
          <div>
            <p className="font-medium">方药</p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              {plan.herbalPlan.map((item, index) => (
                <li key={`${item.formula}-${index}`}>
                  {item.formula}
                  {item.modification ? `（${item.modification}）` : ''}
                  <span className="ml-1 font-mono text-[10px] text-primary">[{item.source}]</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">{advice.disclaimer}</p>
      </CardContent>
    </Card>
  );
}
