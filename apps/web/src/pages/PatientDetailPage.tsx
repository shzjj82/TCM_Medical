import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { FormSheet } from '../components/ui/form-sheet';
import { CaseForm } from '../components/CaseForm';
import { CourseRecordForm } from '../components/CourseRecordForm';
import { FollowVisitForm } from '../components/FollowVisitForm';
import type { LifecycleAdd } from '../components/PatientLifecycle';
import { PatientProfileFields, profileFromPatient, profileIssues, profilePayload, type PatientProfileValue } from '../components/PatientProfileFields';
import { PatientBrief, toPatientBrief } from '../components/PatientBrief';
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
  const [recordKey, setRecordKey] = useState('');
  const [recordMode, setRecordMode] = useState<'return' | 'close' | 'refer' | 'follow' | null>(null);
  const [showEdit, setShowEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setPatient(await api.getPatient(patientKey)); }
    catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }, [patientKey]);

  useEffect(() => { void load(); }, [load]);

  function openAdd(action: LifecycleAdd, caseKey?: string) {
    setError(null);
    if (action === 'intake') {
      setShowCaseForm(true);
      return;
    }
    if (!caseKey) {
      setError('请先完成初诊');
      return;
    }
    setRecordKey(caseKey);
    setRecordMode(action === 'follow-note' ? 'follow' : action);
  }

  if (loading && !patient) return <Card className="p-6 text-sm text-muted-foreground">加载中…</Card>;
  if (!patient) return <Alert tone="danger">{error ?? '未找到该病患'}</Alert>;

  const recordCase = recordKey
    ? (patient.cases ?? []).find((item) => item.externalId === recordKey || item.id === recordKey)
    : undefined;

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4" />返回列表</Button>
          {(patient.cases ?? []).length ? null : (
            <Button size="sm" onClick={() => { setError(null); setShowCaseForm(true); }}>新增档案</Button>
          )}
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <PatientBrief data={toPatientBrief(patient)} onEdit={() => setShowEdit(true)} />
      </div>
      <PatientLifecycle
        className="mt-4 min-h-0 flex-1 md:mt-3"
        patient={patient}
        onOpenCase={onOpenCase}
        onAdd={(action, caseKey) => openAdd(action, caseKey)}
      />
      {showEdit ? (
        <PatientEditForm
          patient={patient}
          onClose={() => setShowEdit(false)}
          onSaved={async () => { setShowEdit(false); await load(); }}
        />
      ) : null}
      {showCaseForm ? (
        <CaseForm
          patientKey={patient.externalId ?? patient.id}
          aiAllowed={patient.aiConsent === 'granted'}
          onClose={() => setShowCaseForm(false)}
          onCreated={async () => { setShowCaseForm(false); await load(); }}
        />
      ) : null}
      {recordMode === 'return' && recordCase ? (
        <FollowVisitForm
          caseRecord={recordCase}
          visits={(patient.visits ?? []).filter((item) => item.caseId === recordCase.id)}
          aiAllowed={patient.aiConsent === 'granted'}
          onClose={() => setRecordMode(null)}
          onSaved={async () => { setRecordMode(null); await load(); }}
        />
      ) : null}
      {recordMode && recordMode !== 'return' && recordCase ? (
        <CourseRecordForm
          mode={recordMode}
          caseKey={recordCase.externalId ?? recordCase.id}
          onClose={() => setRecordMode(null)}
          onSaved={async () => { setRecordMode(null); await load(); }}
        />
      ) : null}
    </div>
  );
}

function PatientEditForm({
  patient,
  onClose,
  onSaved,
}: {
  patient: Patient;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<PatientProfileValue>(() => profileFromPatient(patient));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);

  async function submit() {
    setError(null);
    if (!form.name.trim()) return setError('请填写病患姓名');
    const issue = profileIssues(form);
    if (issue) {
      setReveal((current) => current + 1);
      return setError(issue);
    }
    setSaving(true);
    try {
      await api.updatePatient(patient.externalId ?? patient.id, profilePayload(form));
      await onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open
      title="编辑患者信息"
      onClose={onClose}
      footer={(
        <div className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="flex-1 border-slate-200 md:flex-none" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" className="flex-1 md:w-auto md:flex-none" onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      )}
    >
      <PatientProfileFields reveal={reveal} value={form} idCardMask={patient.idCardMask} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
    </FormSheet>
  );
}
