import { useState, type ReactNode } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input, Label, Textarea } from './ui/input';
import { api } from '../lib/api';

/** 疾病信息（就诊档案）表单字段。纯中医，无西医诊断。 */
export const EMPTY_CASE = {
  chiefComplaint: '',
  presentIllness: '',
  tcmDisease: '',
  tcmSyndrome: '',
  symptoms: '',
  tongue: '',
  pulse: '',
  severityScore: '5',
  principle: '',
  acupoints: '',
  prescriptions: '',
  lifestyle: '',
};

export type CaseFormState = typeof EMPTY_CASE;

export function splitList(value: string): string[] {
  return value.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
}

/** 把表单状态转成提交载荷；主诉为空时返回 null（由调用方提示）。 */
export function buildCasePayload(form: CaseFormState, patientKey: string): Record<string, unknown> | null {
  if (!form.chiefComplaint.trim()) return null;
  return {
    patientId: patientKey,
    chiefComplaint: form.chiefComplaint.trim(),
    presentIllness: form.presentIllness.trim() || undefined,
    tcmDisease: form.tcmDisease.trim() || undefined,
    tcmSyndrome: form.tcmSyndrome.trim() || undefined,
    symptoms: splitList(form.symptoms),
    tongue: form.tongue.trim() || undefined,
    pulse: form.pulse.trim() || undefined,
    severityScore: Number(form.severityScore || 5),
    treatmentPlan: {
      principle: form.principle.trim() || undefined,
      acupoints: splitList(form.acupoints),
      prescriptions: splitList(form.prescriptions),
      lifestyle: splitList(form.lifestyle),
    },
  };
}

export function FieldWrapper({ label, required, optional, hint, children }: {
  label: string; required?: boolean; optional?: boolean; hint?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? <span className="text-xs font-normal text-muted-foreground">选填</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** 疾病信息字段区（受控），建档「病患+疾病」模式与档案页「新增档案」共用。 */
export function CaseFields({ form, onChange }: { form: CaseFormState; onChange: (key: keyof CaseFormState, value: string) => void }) {
  return (
    <div className="space-y-4">
      <FieldWrapper label="主诉" required hint="症状 + 持续时间，例如：头晕头胀 3 月">
        <Input value={form.chiefComplaint} onChange={(e) => onChange('chiefComplaint', e.target.value)} />
      </FieldWrapper>

      <FieldWrapper label="现病史" optional hint="起病经过、诊治经过、当前症状">
        <Textarea value={form.presentIllness} onChange={(e) => onChange('presentIllness', e.target.value)}
                  placeholder="例：3 月前无明显诱因出现头晕头胀，劳累后加重，曾自服天麻丸效果不显…" />
      </FieldWrapper>

      <div className="grid gap-4 md:grid-cols-2">
        <FieldWrapper label="中医病名" optional>
          <Input value={form.tcmDisease} onChange={(e) => onChange('tcmDisease', e.target.value)} placeholder="眩晕 / 消渴 / 不寐" />
        </FieldWrapper>
        <FieldWrapper label="辨证分型" optional>
          <Input value={form.tcmSyndrome} onChange={(e) => onChange('tcmSyndrome', e.target.value)} placeholder="肝阳上亢、痰湿中阻" />
        </FieldWrapper>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <FieldWrapper label="舌象" optional>
          <Input value={form.tongue} onChange={(e) => onChange('tongue', e.target.value)} placeholder="舌红苔黄腻" />
        </FieldWrapper>
        <FieldWrapper label="脉象" optional>
          <Input value={form.pulse} onChange={(e) => onChange('pulse', e.target.value)} placeholder="弦滑" />
        </FieldWrapper>
        <FieldWrapper label="严重度评分" required hint="0~10，疗效对比锚点">
          <Input value={form.severityScore} onChange={(e) => onChange('severityScore', e.target.value)} inputMode="numeric" />
        </FieldWrapper>
      </div>

      <FieldWrapper label="伴随症状" optional>
        <Input value={form.symptoms} onChange={(e) => onChange('symptoms', e.target.value)} placeholder="逗号分隔，如：头晕, 头胀, 夜寐欠安" />
      </FieldWrapper>

      <div className="rounded-md border border-border bg-secondary/30 p-3">
        <p className="mb-3 text-xs font-medium text-foreground">就诊方案</p>
        <div className="space-y-4">
          <FieldWrapper label="治则治法" optional>
            <Input value={form.principle} onChange={(e) => onChange('principle', e.target.value)} placeholder="平肝潜阳、化痰祛湿" />
          </FieldWrapper>
          <div className="grid gap-4 md:grid-cols-2">
            <FieldWrapper label="取穴" optional>
              <Input value={form.acupoints} onChange={(e) => onChange('acupoints', e.target.value)} placeholder="曲池, 太冲, 足三里" />
            </FieldWrapper>
            <FieldWrapper label="方剂" optional>
              <Input value={form.prescriptions} onChange={(e) => onChange('prescriptions', e.target.value)} placeholder="天麻钩藤饮加减" />
            </FieldWrapper>
          </div>
          <FieldWrapper label="调摄医嘱" optional>
            <Input value={form.lifestyle} onChange={(e) => onChange('lifestyle', e.target.value)} placeholder="低盐饮食, 规律作息" />
          </FieldWrapper>
        </div>
      </div>
    </div>
  );
}

interface Props {
  patientKey: string;
  onCreated?: () => void | Promise<void>;
}

/** 给已有病患新增一份就诊档案（疾病信息）。 */
export function CaseForm({ patientKey, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_CASE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const update = (key: keyof CaseFormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null); setDone(null);
    const payload = buildCasePayload(form, patientKey);
    if (!payload) return setError('请填写主诉（症状 + 时长）');
    setSaving(true);
    try {
      await api.createCase(payload);
      setDone('已建立就诊档案');
      setForm(EMPTY_CASE);
      await onCreated?.();
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>新增就诊档案（疾病信息）</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <CaseFields form={form} onChange={update} />
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}
        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>{saving ? '提交中…' : '建立档案'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
