import { useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { buildCasePayload, CaseFields, EMPTY_CASE, type CaseFormState } from './CaseForm';
import { applyIntakeDraft, VoiceIntake } from './VoiceIntake';
import { EMPTY_PROFILE, PatientProfileFields, profileIssues, profilePayload, type PatientProfileValue } from './PatientProfileFields';
import { api } from '../lib/api';

interface Props { onCreated?: () => void | Promise<void>; }

type Mode = 'patient' | 'patient+case';

/**
 * 建档表单，两种模式：
 * 1. 仅病患信息 —— 先建人，疾病信息（就诊档案）后续再补；
 * 2. 病患 + 疾病信息 —— 一次填完，建档同时生成首份就诊档案。
 * 必填项红色 * 标注、选填项「选填」后缀明示。
 */
export function IntakeForm({ onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('patient+case');
  const [patient, setPatient] = useState<PatientProfileValue>(EMPTY_PROFILE);
  const [caseForm, setCaseForm] = useState<CaseFormState>(EMPTY_CASE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [reveal, setReveal] = useState(0);

  const updateCase = (key: keyof CaseFormState, value: string) =>
    setCaseForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null); setDone(null);
    if (!patient.name.trim()) return setError('请填写病患姓名');
    const issue = profileIssues(patient);
    if (issue) {
      setReveal((current) => current + 1);
      return setError(issue);
    }
    if (mode === 'patient+case' && (!caseForm.chiefComplaint.trim() || !caseForm.presentIllness.trim())) {
      return setError('初诊需要填写主诉和现病史；如暂不填写疾病信息，请切换为「仅病患信息」');
    }
    setSaving(true);
    try {
      const created = await api.syncPatient(profilePayload(patient) as never);

      if (mode === 'patient+case') {
        const payload = buildCasePayload(caseForm, created.externalId ?? created.id);
        if (payload) await api.createCase(payload);
      }

      setDone(mode === 'patient+case' ? `已建档：${patient.name}（含首份就诊档案）` : `已建档：${patient.name}（疾病信息可后续补充）`);
      setPatient(EMPTY_PROFILE);
      setCaseForm(EMPTY_CASE);
      await onCreated?.();
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
        <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
          {([['patient+case', '病患 + 疾病信息'], ['patient', '仅病患信息']] as Array<[Mode, string]>).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={`flex-1 rounded px-3 py-1.5 text-xs ${mode === key ? 'bg-card shadow font-medium' : 'text-muted-foreground'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <PatientProfileFields reveal={reveal} value={patient} onChange={(patch) => setPatient((current) => ({ ...current, ...patch }))} />

        {mode === 'patient+case' ? (
          <>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium text-foreground">疾病信息</p>
              <VoiceIntake
                disabled={saving}
                onDraft={(draft) => setCaseForm((prev) => applyIntakeDraft(prev, draft))}
              />
              <div className="mt-4">
              <CaseFields form={caseForm} onChange={updateCase} />
              </div>
            </div>
          </>
        ) : (
          <p className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
            仅保存病患基本信息。就诊档案（主诉 / 现病史 / 就诊方案）可稍后在病患详情页「初诊」。
          </p>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <div className="flex justify-end">
          <Button className="w-full md:w-auto" onClick={submit} disabled={saving}>{saving ? '提交中…' : '建立档案'}</Button>
        </div>
    </div>
  );
}
