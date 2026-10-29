import { useState, type ReactNode } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { FormSheet } from './ui/form-sheet';
import { Input, Label, Textarea } from './ui/input';
import { ClinicalEntry, uploadTongue, type ClinicalTab, type TongueDraft } from './ClinicalEntry';
import { api } from '../lib/api';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

/** 疾病信息（就诊档案）表单字段。纯中医，无西医诊断。 */
export const EMPTY_CASE = {
  chiefComplaint: '',
  presentIllness: '',
  menstrualHistory: '',
  dailyCondition: '',
  tongue: '',
  pulse: '',
  signs: '',
  westernDiagnosis: '',
  tcmDisease: '',
  tcmSyndrome: '',
  symptoms: '',
  severityScore: '5',
  principle: '',
  acupoints: '',
  prescriptions: '',
  lifestyle: '',
  followDate: '',
  followNote: '',
};

export type CaseFormTab = 'record' | 'material' | 'plan' | 'advise';

export type CaseFormState = typeof EMPTY_CASE;

export function splitList(value: string): string[] {
  return value.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
}

/** 把表单状态转成提交载荷；主诉或现病史为空时返回 null。 */
export function buildCasePayload(form: CaseFormState, patientKey: string): Record<string, unknown> | null {
  if (!form.chiefComplaint.trim() || !form.presentIllness.trim()) return null;
  return {
    patientId: patientKey,
    chiefComplaint: form.chiefComplaint.trim(),
    presentIllness: form.presentIllness.trim(),
    tcmDisease: form.tcmDisease.trim() || undefined,
    tcmSyndrome: form.tcmSyndrome.trim() || undefined,
    symptoms: splitList(form.symptoms),
    menstrualHistory: form.menstrualHistory.trim() || undefined,
    dailyCondition: form.dailyCondition.trim() || undefined,
    tongue: form.tongue.trim() || undefined,
    pulse: form.pulse.trim() || undefined,
    signs: form.signs.trim() || undefined,
    westernDiagnosis: form.westernDiagnosis.trim() || undefined,
    diagnosis: {
      westernDiagnosis: form.westernDiagnosis.trim() || undefined,
      tcmDisease: form.tcmDisease.trim() || undefined,
      tcmSyndrome: form.tcmSyndrome.trim() || undefined,
    },
    treatmentPlan: {
      principle: form.principle.trim() || undefined,
      acupoints: splitList(form.acupoints),
      prescriptions: splitList(form.prescriptions),
      lifestyle: splitList(form.lifestyle),
      ...(form.followDate || form.followNote.trim()
        ? { followup: { date: form.followDate || undefined, note: form.followNote.trim() || undefined } }
        : {}),
    },
  };
}

export function FieldWrapper({ label, required, optional, hint, error, children }: {
  label: string; required?: boolean; optional?: boolean; hint?: string; error?: string; children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
        {optional ? <span className="text-xs font-normal text-muted-foreground">选填</span> : null}
      </Label>
      {children}
      {error ? <p className="text-xs text-destructive">{error}</p> : hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function NoteField({ label, value, placeholder, onChange, required }: { label: string; value: string; placeholder: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <div className="md:col-span-2">
      <FieldWrapper label={label} required={required}>
        <Textarea className={`${controlClass} min-h-[72px] resize-y`} rows={2} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      </FieldWrapper>
    </div>
  );
}

function DiagnosisFields({
  form,
  onChange,
  divided = true,
}: {
  form: CaseFormState;
  onChange: (key: keyof CaseFormState, value: string) => void;
  divided?: boolean;
}) {
  return (
    <>
      <div className={divided ? 'md:col-span-2 border-t border-slate-100 pt-4' : 'md:col-span-2'}>
        <p className="text-sm font-medium text-slate-800">诊断</p>
      </div>
      <div className="md:col-span-2">
        <FieldWrapper label="西医诊断">
          <Input className={controlClass} value={form.westernDiagnosis} onChange={(e) => onChange('westernDiagnosis', e.target.value)} placeholder="如高血压病、2 型糖尿病" />
        </FieldWrapper>
      </div>
      <FieldWrapper label="中医病名">
        <Input className={controlClass} value={form.tcmDisease} onChange={(e) => onChange('tcmDisease', e.target.value)} placeholder="眩晕 / 消渴 / 不寐" />
      </FieldWrapper>
      <FieldWrapper label="证型">
        <Input className={controlClass} value={form.tcmSyndrome} onChange={(e) => onChange('tcmSyndrome', e.target.value)} placeholder="肝阳上亢、痰湿中阻" />
      </FieldWrapper>
    </>
  );
}

function CaseRecordFields({
  form,
  onChange,
  hideDiagnosis = false,
}: {
  form: CaseFormState;
  onChange: (key: keyof CaseFormState, value: string) => void;
  hideDiagnosis?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <FieldWrapper label="主诉" required>
          <Input className={controlClass} value={form.chiefComplaint} onChange={(e) => onChange('chiefComplaint', e.target.value)} placeholder="症状 + 持续时间，例如头晕头胀 3 月" />
        </FieldWrapper>
      </div>
      <NoteField label="现病史" required value={form.presentIllness} placeholder="起病经过、诊治经过、当前症状" onChange={(value) => onChange('presentIllness', value)} />
      <NoteField label="月经、生育情况" value={form.menstrualHistory} placeholder="月经周期、孕产情况；不适用可留空" onChange={(value) => onChange('menstrualHistory', value)} />
      <NoteField label="饮食、睡眠、二便、情志、运动情况" value={form.dailyCondition} placeholder="饮食、睡眠、二便、情志和运动" onChange={(value) => onChange('dailyCondition', value)} />
      <FieldWrapper label="舌象">
        <Input className={controlClass} value={form.tongue} onChange={(e) => onChange('tongue', e.target.value)} placeholder="舌红苔黄腻" />
      </FieldWrapper>
      <FieldWrapper label="脉象">
        <Input className={controlClass} value={form.pulse} onChange={(e) => onChange('pulse', e.target.value)} placeholder="弦滑" />
      </FieldWrapper>
      <FieldWrapper label="体征">
        <Input className={controlClass} value={form.signs} onChange={(e) => onChange('signs', e.target.value)} placeholder="体温、血压、腹部压痛等" />
      </FieldWrapper>
      {hideDiagnosis ? null : <DiagnosisFields form={form} onChange={onChange} />}
    </div>
  );
}

function CasePlanFields({ form, onChange }: { form: CaseFormState; onChange: (key: keyof CaseFormState, value: string) => void }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="md:col-span-2">
        <FieldWrapper label="治则治法">
          <Input className={controlClass} value={form.principle} onChange={(e) => onChange('principle', e.target.value)} placeholder="平肝潜阳、化痰祛湿" />
        </FieldWrapper>
      </div>
      <FieldWrapper label="取穴">
        <Input className={controlClass} value={form.acupoints} onChange={(e) => onChange('acupoints', e.target.value)} placeholder="曲池，太冲，足三里" />
      </FieldWrapper>
      <FieldWrapper label="方剂">
        <Input className={controlClass} value={form.prescriptions} onChange={(e) => onChange('prescriptions', e.target.value)} placeholder="天麻钩藤饮加减" />
      </FieldWrapper>
      <div className="md:col-span-2">
        <FieldWrapper label="调摄医嘱">
          <Input className={controlClass} value={form.lifestyle} onChange={(e) => onChange('lifestyle', e.target.value)} placeholder="低盐饮食，规律作息" />
        </FieldWrapper>
      </div>
    </div>
  );
}

/** 疾病信息字段区（受控）。建档页按顺序铺开；档案弹窗按页签拆开。 */
export function CaseFields({
  form,
  onChange,
}: {
  form: CaseFormState;
  onChange: (key: keyof CaseFormState, value: string) => void;
}) {
  return (
    <div className="space-y-6">
      <CaseRecordFields form={form} onChange={onChange} />
      <CasePlanFields form={form} onChange={onChange} />
    </div>
  );
}

interface Props {
  patientKey: string;
  aiAllowed?: boolean;
  initialTab?: CaseFormTab;
  onClose: () => void;
  onCreated?: () => void | Promise<void>;
}

function adviceText(form: CaseFormState): string {
  return [
    form.chiefComplaint,
    form.presentIllness,
    form.symptoms,
    form.tongue && `舌象 ${form.tongue}`,
    form.pulse && `脉象 ${form.pulse}`,
    form.tcmDisease && `病名 ${form.tcmDisease}`,
    form.tcmSyndrome && `证型 ${form.tcmSyndrome}`,
    form.principle && `治则 ${form.principle}`,
  ].filter(Boolean).join('，');
}

/** 初诊：同时建立疾病档案和第 1 次就诊。主诉和现病史都必填。 */
export function CaseForm({ patientKey, aiAllowed = false, onClose, onCreated }: Props) {
  const [form, setForm] = useState(EMPTY_CASE);
  const [tab, setTab] = useState<ClinicalTab>('chart');
  const [tongue, setTongue] = useState<TongueDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof CaseFormState, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit(confirm: boolean) {
    setError(null);
    if (!form.chiefComplaint.trim() || !form.presentIllness.trim()) {
      setTab('chart');
      return setError('初诊需要填写主诉和现病史');
    }
    const payload = buildCasePayload(form, patientKey);
    if (!payload) {
      setTab('chart');
      return setError('初诊需要填写主诉和现病史');
    }
    setSaving(true);
    try {
      const uploaded = await uploadTongue(tongue);
      await api.createCase({
        ...payload,
        firstVisit: {
          text: adviceText(form),
          media: uploaded ? [{ kind: 'tongue', name: uploaded.name, url: uploaded.url }] : [],
          channels: uploaded ? ['image'] : [],
          reviewStatus: confirm ? 'confirmed' : 'pending',
          keepSummary: true,
        },
      });
      if (tongue) URL.revokeObjectURL(tongue.preview);
      setForm(EMPTY_CASE);
      setTongue(null);
      await onCreated?.();
    } catch (err) { setError(String(err).replace(/^\d+\s*/, '')); }
    finally { setSaving(false); }
  }

  return (
    <FormSheet
      open
      title="初诊"
      onClose={onClose}
      footer={(
        <div className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-slate-200" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => void submit(true)} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      )}
    >
      <ClinicalEntry
        tab={tab}
        onTab={setTab}
        value={form}
        onChange={update}
        tongue={tongue}
        onTongue={setTongue}
        aiAllowed={aiAllowed}
        saving={saving}
      />
    </FormSheet>
  );
}
