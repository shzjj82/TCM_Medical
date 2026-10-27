import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CaseForm } from '../components/CaseForm';
import { api } from '../lib/api';
import { pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';
import type { Patient } from '../types';

interface Props {
  patientKey: string;
  onBack: () => void;
  onOpenCase: (caseKey: string) => void;
}

/** 病患详情：基本信息 + 就诊档案（疾病信息）列表。点击档案进入诊断档案页。 */
export function PatientDetailPage({ patientKey, onBack, onOpenCase }: Props) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCaseForm, setShowCaseForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPatient(await api.getPatient(patientKey)); }
    catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }, [patientKey]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !patient) return <Card className="p-6 text-sm text-muted-foreground">加载中…</Card>;
  if (!patient) return <Alert tone="danger">{error ?? '未找到该病患'}</Alert>;

  const cases = patient.cases ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" />返回列表</Button>
        <Button size="sm" onClick={() => setShowCaseForm((v) => !v)}>
          <Plus className="h-4 w-4" />{showCaseForm ? '收起' : '新增档案'}
        </Button>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold">{patient.name}</p>
            <span className="text-xs text-muted-foreground">
              {patient.gender ?? '性别未填'} · {patient.age ? `${patient.age} 岁` : '年龄未填'} · {patient.phone ?? '手机未填'}
            </span>
          </div>
          {patient.tags.length ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {patient.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showCaseForm ? (
        <CaseForm patientKey={patient.externalId ?? patient.id} onCreated={async () => { setShowCaseForm(false); await load(); }} />
      ) : null}

      <Card>
        <CardHeader><CardTitle>就诊档案（{cases.length}）</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cases.length === 0 ? (
            <p className="text-sm text-muted-foreground">暂无就诊档案。点击右上角「新增档案」录入疾病信息。</p>
          ) : (
            cases.map((item) => {
              const contrast = (item.contrast ?? {}) as Record<string, any>;
              const initial = pickNumber(contrast.initial, 'severity_score', 'severityScore');
              const latest = pickNumber(contrast.latest, 'severity_score', 'severityScore');
              const verdict = pickField<string>(contrast.delta, 'verdict', 'verdict');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenCase(item.externalId ?? item.id)}
                  className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      第 {item.caseNo} 档案 · {item.tcmDisease ?? '未命名病'}
                      {item.tcmSyndrome ? <span className="ml-1 text-xs font-normal text-muted-foreground">（{item.tcmSyndrome}）</span> : null}
                    </p>
                    <div className="flex items-center gap-1">
                      <Badge variant={item.status === 'archived' ? 'secondary' : 'success'}>
                        {item.status === 'archived' ? '已归档' : '治疗中'}
                      </Badge>
                      {verdict ? <Badge variant={VERDICT_TONE[verdict] ?? 'secondary'}>{verdict}</Badge> : null}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.chiefComplaint}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    治疗 {item.visitCount} 次
                    {initial !== undefined || latest !== undefined ? ` · 严重度 ${initial ?? '—'} → ${latest ?? '—'}` : ''}
                  </p>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
