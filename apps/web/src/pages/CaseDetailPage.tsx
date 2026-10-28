import { useCallback, useEffect, useState } from 'react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { DiseaseDetail } from '../components/DiseaseDetail';
import { api } from '../lib/api';
import type { CaseRecord, Patient } from '../types';

interface Props {
  caseKey: string;
  patientKey: string;
  onBack: () => void;
}

/** 患者疾病详情：期初 → 治疗过程 → 当前/末期，以及诊疗方案记录。 */
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
  const hasPlan =
    Boolean(String(plan.principle ?? '').trim()) ||
    (plan.acupoints?.length ?? 0) > 0 ||
    (plan.prescriptions?.length ?? 0) > 0 ||
    (plan.lifestyle?.length ?? 0) > 0 ||
    (record.visits ?? []).some((visit) => {
      const parsed = (visit.parsed ?? {}) as Record<string, any>;
      return (
        String(parsed.treatment_principle ?? parsed.treatmentPrinciple ?? '').trim().length > 0 ||
        (Array.isArray(parsed.acupoints) && parsed.acupoints.length > 0) ||
        (Array.isArray(parsed.prescriptions) && parsed.prescriptions.length > 0)
      );
    });

  return (
    <div className="space-y-3">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {confirming && !archived ? (
        <Alert tone="warn" title="确认归档该疾病档案？">
          <div className="mt-2 space-y-2">
            <p>归档后档案只读，不能再添加治疗记录。右侧卡片会改为「末期情况」，全文沉淀到内部知识库。</p>
            {!hasPlan ? (
              <p className="text-destructive">
                归档要求至少一条就诊方案（治则治法 / 取穴 / 方剂 / 调摄）。请先在病历详情中补充，或录入一次带方案的治疗。
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

      <DiseaseDetail
        record={record}
        patient={patient}
        archived={archived}
        hasPlan={hasPlan}
        onBack={onBack}
        onRequestArchive={() => setConfirming(true)}
        onSaved={load}
      />
    </div>
  );
}
