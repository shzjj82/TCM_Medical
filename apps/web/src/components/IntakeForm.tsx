import { useState, type ReactNode } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input, Label } from './ui/input';
import { api } from '../lib/api';

interface Props {
  onCreated?: () => void | Promise<void>;
}

const EMPTY = {
  name: '',
  gender: '',
  age: '',
  phone: '',
  chief_complaint: '',
  western_diagnosis: '',
  tcm_disease: '',
  tcm_syndrome: '',
  symptoms: '',
  tongue: '',
  pulse: '',
  severity_score: '5',
  tags: '',
};

/**
 * 建档表单。必填项用红色 * 标注、选填项用「选填」后缀明示——不允许把必填藏起来。
 * 提交走 Skill 的 intake 命令（与 AI 管线同一套逻辑），失败时回落到服务端 /patients/sync。
 */
export function IntakeForm({ onCreated }: Props) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const update = (key: keyof typeof EMPTY, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    setError(null);
    setDone(null);
    if (!form.name.trim()) return setError('请填写病人姓名');
    if (!form.chief_complaint.trim()) return setError('请填写主诉（症状 + 时长）');
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        gender: form.gender || undefined,
        age: form.age ? Number(form.age) : undefined,
        phone: form.phone || undefined,
        chief_complaint: form.chief_complaint.trim(),
        western_diagnosis: splitList(form.western_diagnosis),
        tcm_disease: form.tcm_disease || undefined,
        tcm_syndrome: form.tcm_syndrome || undefined,
        symptoms: splitList(form.symptoms),
        tongue: form.tongue || undefined,
        pulse: form.pulse || undefined,
        severity_score: Number(form.severity_score || 5),
        tags: splitList(form.tags),
      };
      let createdName = payload.name;
      try {
        await api.runSkill('tcm_intake', { json: JSON.stringify(payload) });
      } catch {
        await api.syncPatient({
          name: payload.name,
          gender: payload.gender,
          age: payload.age,
          phone: payload.phone,
          tags: payload.tags,
          initialCondition: payload as unknown as Record<string, unknown>,
          currentCondition: payload as unknown as Record<string, unknown>,
        } as never);
      }
      setDone(`已建档：${createdName}`);
      setForm(EMPTY);
      await onCreated?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>初始录入 · 建立病人档案</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <FieldWrapper label="姓名" required>
            <Input value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="张某某" />
          </FieldWrapper>
          <FieldWrapper label="性别" optional>
            <Input value={form.gender} onChange={(e) => update('gender', e.target.value)} placeholder="男 / 女" />
          </FieldWrapper>
          <FieldWrapper label="年龄" optional>
            <Input value={form.age} onChange={(e) => update('age', e.target.value)} placeholder="52" inputMode="numeric" />
          </FieldWrapper>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="联系手机" optional>
            <Input value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="138****0000" />
          </FieldWrapper>
          <FieldWrapper label="标签" optional hint="便于后续按病种聚合">
            <Input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="眩晕, 高血压" />
          </FieldWrapper>
        </div>

        <FieldWrapper label="主诉" required hint="症状 + 持续时间，例如：头晕头胀 3 月">
          <Input value={form.chief_complaint} onChange={(e) => update('chief_complaint', e.target.value)} />
        </FieldWrapper>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="西医诊断" optional>
            <Input value={form.western_diagnosis} onChange={(e) => update('western_diagnosis', e.target.value)} placeholder="逗号分隔" />
          </FieldWrapper>
          <FieldWrapper label="中医病名" optional>
            <Input value={form.tcm_disease} onChange={(e) => update('tcm_disease', e.target.value)} placeholder="眩晕 / 消渴 / 不寐" />
          </FieldWrapper>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FieldWrapper label="辨证分型" optional>
            <Input value={form.tcm_syndrome} onChange={(e) => update('tcm_syndrome', e.target.value)} placeholder="肝阳上亢、痰湿中阻" />
          </FieldWrapper>
          <FieldWrapper label="伴随症状" optional>
            <Input value={form.symptoms} onChange={(e) => update('symptoms', e.target.value)} placeholder="中医症状，逗号分隔" />
          </FieldWrapper>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <FieldWrapper label="舌象" optional>
            <Input value={form.tongue} onChange={(e) => update('tongue', e.target.value)} placeholder="舌红苔黄腻" />
          </FieldWrapper>
          <FieldWrapper label="脉象" optional>
            <Input value={form.pulse} onChange={(e) => update('pulse', e.target.value)} placeholder="弦滑" />
          </FieldWrapper>
          <FieldWrapper label="严重度评分" required hint="0~10，作为疗效对比锚点">
            <Input value={form.severity_score} onChange={(e) => update('severity_score', e.target.value)} inputMode="numeric" />
          </FieldWrapper>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}（期初情况已写入，后续只允许追加修正，不覆盖原值）</Alert> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>
            {saving ? '提交中…' : '建立档案'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function FieldWrapper({
  label,
  required,
  optional,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  hint?: string;
  children: ReactNode;
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

function splitList(value: string): string[] {
  return value.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
}
