import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { FormSheet } from '../components/ui/form-sheet';
import { CaseForm } from '../components/CaseForm';
import { PatientLifecycle } from '../components/PatientLifecycle';
import { api } from '../lib/api';
import type { Patient } from '../types';

interface Props {
  patientKey: string;
  onBack: () => void;
  onOpenCase: (caseKey: string) => void;
}

/** 病患详情：全生命周期对比 + 病历与诊疗记录。 */
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

  return (
    <div className="space-y-3">
      <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" />返回列表</Button>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <PatientLifecycle
        patient={patient}
        onOpenCase={onOpenCase}
        onCreateCase={() => setShowCaseForm(true)}
      />
      <FormSheet open={showCaseForm} title="新增疾病档案" onClose={() => setShowCaseForm(false)}>
        <CaseForm
          patientKey={patient.externalId ?? patient.id}
          onCreated={async () => { setShowCaseForm(false); await load(); }}
        />
      </FormSheet>
    </div>
  );
}
