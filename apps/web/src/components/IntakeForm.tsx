import { useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { buildCasePayload, CaseFields, EMPTY_CASE, FieldWrapper, splitList, type CaseFormState } from './CaseForm';
import { api } from '../lib/api';

interface Props { onCreated?: () => void | Promise<void>; }

const EMPTY_PATIENT = { name: '', gender: '', age: '', phone: '', tags: '' };

type Mode = 'patient' | 'patient+case';

/**
 * 建档表单，两种模式：
 * 1. 仅病患信息 —— 先建人，疾病信息（就诊档案）后续再补；
 * 2. 病患 + 疾病信息 —— 一次填完，建档同时生成首份就诊档案。
 * 必填项红色 * 标注、选填项「选填」后缀明示。
 */
export function IntakeForm({ onCreated }: Props) {
  const [mode, setMode] = useState<Mode>('patient+case');
  const [patient, setPatient] = useState(EMPTY_PATIENT);
  const [caseForm, setCaseForm] = useState<CaseFormState>(EMPTY_CASE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const updatePatient = (key: keyof typeof EMPTY_PATIENT, value: string) =>
    setPatient((prev) => ({ ...prev, [key]: value }));
  const updateCase = (key: keyof CaseFormState, value: string) =>
    setCaseForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null); setDone(null);
    if (!patient.name.trim()) return setError('请填写病患姓名');
    if (mode === 'patient+case' && !caseForm.chiefComplaint.trim()) {
      return setError('当前模式需要填写主诉；如暂不填写疾病信息，请切换为「仅病患信息」');
    }
    setSaving(true);
    try {
      const created = await api.syncPatient({
        name: patient.name.trim(),
        gender: patient.gender || undefined,
        age: patient.age ? Number(patient.age) : undefined,
        phone: patient.phone || undefined,
        tags: splitList(patient.tags),
      } as never);

      if (mode === 'patient+case') {
        const payload = buildCasePayload(caseForm, created.externalId ?? created.id);
        if (payload) await api.createCase(payload);
      }

      setDone(mode === 'patient+case' ? `已建档：${patient.name}（含首份就诊档案）` : `已建档：${patient.name}（疾病信息可后续补充）`);
      setPatient(EMPTY_PATIENT);
      setCaseForm(EMPTY_CASE);
      await onCreated?.();
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>初始录入 · 建立病患档案</CardTitle></CardHeader>
      <CardContent className="space-y-4">
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

        <div className="grid gap-4 md:grid-cols-3">
          <FieldWrapper label="姓名" required>
            <Input value={patient.name} onChange={(e) => updatePatient('name', e.target.value)} placeholder="张某某" />
          </FieldWrapper>
          <FieldWrapper label="性别" optional>
            <Input value={patient.gender} onChange={(e) => updatePatient('gender', e.target.value)} placeholder="男 / 女" />
          </FieldWrapper>
          <FieldWrapper label="年龄" optional>
            <Input value={patient.age} onChange={(e) => updatePatient('age', e.target.value)} placeholder="52" inputMode="numeric" />
          </FieldWrapper>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="联系手机" optional>
            <Input value={patient.phone} onChange={(e) => updatePatient('phone', e.target.value)} placeholder="138****0000" />
          </FieldWrapper>
          <FieldWrapper label="标签" optional hint="便于后续按病种聚合">
            <Input value={patient.tags} onChange={(e) => updatePatient('tags', e.target.value)} placeholder="眩晕, 失眠" />
          </FieldWrapper>
        </div>

        {mode === 'patient+case' ? (
          <>
            <div className="border-t border-border pt-4">
              <p className="mb-3 text-xs font-medium text-foreground">疾病信息（首份就诊档案）</p>
              <CaseFields form={caseForm} onChange={updateCase} />
            </div>
          </>
        ) : (
          <p className="rounded-md bg-secondary/50 p-3 text-xs text-muted-foreground">
            仅保存病患基本信息。就诊档案（主诉 / 现病史 / 就诊方案）可稍后在病患详情页「新增档案」。
          </p>
        )}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving ? '提交中…' : '建立档案'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
