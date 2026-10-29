import { useMemo, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { FormSheet } from './ui/form-sheet';
import { Label, Textarea } from './ui/input';
import { splitList } from './CaseForm';
import { ClinicalEntry, uploadTongue, type ClinicalTab, type ClinicalValue, type TongueDraft } from './ClinicalEntry';
import { api } from '../lib/api';
import { pickField } from '../lib/coerce';
import { kindOf } from '../lib/visit-kind';
import type { CaseRecord, Visit } from '../types';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

type Focus = 'visit' | 'follow';

interface CompareResult {
  improved: string[];
  worsened: string[];
  added: string[];
  resolved: string[];
  unchanged: string[];
}

const COMPARE_LABELS: Array<[keyof CompareResult, string]> = [
  ['improved', '好转'],
  ['worsened', '加重'],
  ['added', '新增'],
  ['resolved', '消失'],
  ['unchanged', '无明显变化'],
];

function clean(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function listText(value: unknown): string {
  if (Array.isArray(value)) return value.map((item) => clean(String(item))).filter(Boolean).join('、');
  return clean(typeof value === 'string' ? value : '');
}

function previousOf(record: CaseRecord, visits: Visit[]) {
  const treatment = [...visits].reverse().find((item) => {
    const kind = kindOf(item);
    return kind === 'first' || kind === 'return';
  });
  const parsed = (treatment?.parsed ?? {}) as Record<string, unknown>;
  const diagnosis = (treatment?.diagnosis ?? {}) as Record<string, unknown>;
  const plan = record.treatmentPlan;
  const syndrome = clean(pickField<string>(diagnosis, 'tcmSyndrome', 'tcm_syndrome'))
    || clean(pickField<string>(parsed, 'tcmSyndrome', 'tcm_syndrome'))
    || clean(record.tcmSyndrome);
  const principle = clean(pickField<string>(diagnosis, 'principle', 'treatmentPrinciple'))
    || clean(pickField<string>(parsed, 'treatmentPrinciple', 'treatment_principle'))
    || clean(plan?.principle);
  const acupoints = listText(diagnosis.acupoints) || listText(parsed.acupoints) || (plan?.acupoints ?? []).join('、');
  const prescriptions = listText(diagnosis.prescriptions) || listText(parsed.prescriptions) || (plan?.prescriptions ?? []).join('、');
  const lifestyle = listText(diagnosis.lifestyle) || listText(parsed.lifestyle) || (plan?.lifestyle ?? []).join('、');
  const planText = [acupoints && `取穴 ${acupoints}`, prescriptions && `方剂 ${prescriptions}`, lifestyle && `调摄 ${lifestyle}`].filter(Boolean).join('；');
  return {
    chiefComplaint: clean(treatment?.chiefComplaint) || clean(pickField<string>(parsed, 'chiefComplaint', 'chief_complaint')) || clean(record.chiefComplaint),
    presentIllness: clean(treatment?.presentIllness) || clean(pickField<string>(parsed, 'presentIllness', 'present_illness')) || clean(record.presentIllness),
    tongue: clean(typeof parsed.tongue === 'string' ? parsed.tongue : '') || clean(record.tongue),
    pulse: clean(typeof parsed.pulse === 'string' ? parsed.pulse : '') || clean(record.pulse),
    westernDiagnosis: clean(pickField<string>(diagnosis, 'westernDiagnosis', 'western_diagnosis')) || clean(record.diagnosis?.westernDiagnosis),
    tcmDisease: clean(pickField<string>(diagnosis, 'tcmDisease', 'tcm_disease')) || clean(record.tcmDisease),
    syndrome,
    principle,
    acupoints,
    prescriptions,
    lifestyle,
    planText,
    note: clean(treatment?.doctorNote),
  };
}

function messageOf(error: unknown): string {
  return String(error).replace(/^\d+\s*/, '').replace(/^Error:\s*/, '');
}

function emptyClinical(previous: ReturnType<typeof previousOf>): ClinicalValue {
  return {
    chiefComplaint: previous.chiefComplaint,
    presentIllness: previous.presentIllness,
    symptoms: '',
    tongue: previous.tongue,
    pulse: previous.pulse,
    westernDiagnosis: previous.westernDiagnosis,
    tcmDisease: previous.tcmDisease,
    tcmSyndrome: previous.syndrome,
    principle: previous.principle,
    acupoints: previous.acupoints,
    prescriptions: previous.prescriptions,
    lifestyle: previous.lifestyle,
  };
}

/** 复诊：带出上次主诉和现病史，保存时另存一条就诊记录。 */
export function FollowVisitForm({
  caseRecord,
  visits,
  aiAllowed = false,
  focus = 'visit',
  onClose,
  onSaved,
}: {
  caseRecord: CaseRecord;
  visits: Visit[];
  aiAllowed?: boolean;
  focus?: Focus;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const previous = useMemo(() => previousOf(caseRecord, visits), [caseRecord, visits]);
  const [tab, setTab] = useState<ClinicalTab>(focus === 'follow' ? 'plan' : 'chart');
  const [clinical, setClinical] = useState<ClinicalValue>(() => emptyClinical(previous));
  const [tongueFile, setTongueFile] = useState<TongueDraft | null>(null);
  const [adjustment, setAdjustment] = useState('');
  const [summary, setSummary] = useState('');
  const [followDate, setFollowDate] = useState('');
  const [followNote, setFollowNote] = useState('');
  const [compare, setCompare] = useState<CompareResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caseKey = caseRecord.externalId ?? caseRecord.id;

  function currentText(): string {
    return [
      clinical.chiefComplaint,
      clinical.presentIllness,
      clinical.symptoms,
      clinical.tongue && `舌象 ${clinical.tongue}`,
      clinical.pulse && `脉象 ${clinical.pulse}`,
      adjustment,
    ].map((item) => clean(item)).filter(Boolean).join('\n');
  }

  function previousText(): string {
    return [
      previous.chiefComplaint && `主诉 ${previous.chiefComplaint}`,
      previous.presentIllness && `现病史 ${previous.presentIllness}`,
      previous.syndrome && `证型 ${previous.syndrome}`,
      previous.principle && `治则 ${previous.principle}`,
      previous.planText,
      previous.note,
    ].filter(Boolean).join('\n');
  }

  async function runCompare() {
    const current = currentText();
    if (!current) {
      setTab('condition');
      setError('请先填写本次情况');
      return;
    }
    setComparing(true);
    setError(null);
    try { setCompare(await api.compareVisit({ previous: previousText(), current })); }
    catch (err) { setError(messageOf(err)); }
    finally { setComparing(false); }
  }

  async function runSummary() {
    const current = currentText();
    if (!current) {
      setTab('plan');
      setError('请先填写本次情况');
      return;
    }
    setSummarizing(true);
    setError(null);
    try {
      const result = await api.summarizeVisit({ previous: previousText(), current });
      setSummary(result.summary);
    } catch (err) { setError(messageOf(err)); }
    finally { setSummarizing(false); }
  }

  async function submit(confirm: boolean) {
    setError(null);
    if (!clinical.chiefComplaint.trim() || !clinical.presentIllness.trim()) {
      setTab('chart');
      setError('请填写主诉和现病史');
      return;
    }
    const diagnosis = {
      westernDiagnosis: clinical.westernDiagnosis.trim() || undefined,
      tcmDisease: clinical.tcmDisease.trim() || undefined,
      tcmSyndrome: clinical.tcmSyndrome.trim() || undefined,
      principle: clinical.principle.trim() || undefined,
      acupoints: splitList(clinical.acupoints),
      prescriptions: splitList(clinical.prescriptions),
      lifestyle: splitList(clinical.lifestyle),
    };
    const doctorNote = [
      clinical.tcmSyndrome.trim() && clinical.tcmSyndrome.trim() !== previous.syndrome ? `证型：${clinical.tcmSyndrome.trim()}` : '',
      adjustment.trim(),
    ].filter(Boolean).join('\n');
    const nextPlan = [followDate, followNote.trim()].filter(Boolean).join(' ');
    setSaving(true);
    try {
      const uploaded = await uploadTongue(tongueFile);
      await api.addCaseVisit(caseKey, {
        text: currentText(),
        doctorNote: doctorNote || undefined,
        chiefComplaint: clinical.chiefComplaint.trim(),
        presentIllness: clinical.presentIllness.trim(),
        diagnosis,
        parsed: {
          symptoms: splitList(clinical.symptoms),
          tongue: clinical.tongue.trim() || undefined,
          pulse: clinical.pulse.trim() || undefined,
          tcmSyndrome: clinical.tcmSyndrome.trim() || undefined,
          treatmentPrinciple: clinical.principle.trim() || undefined,
          acupoints: diagnosis.acupoints,
          prescriptions: diagnosis.prescriptions,
          lifestyle: diagnosis.lifestyle,
          narrative: summary.trim() || undefined,
        },
        media: uploaded ? [{ kind: 'tongue', name: uploaded.name, url: uploaded.url }] : [],
        channels: uploaded ? ['image'] : [],
        nextPlan: nextPlan || undefined,
        aiMode: 'manual',
        kind: 'return',
        reviewStatus: confirm ? 'confirmed' : 'pending',
        summary: confirm ? summary.trim() || undefined : undefined,
        keepSummary: !(confirm && summary.trim()),
      });
      if (tongueFile) URL.revokeObjectURL(tongueFile.preview);
      await onSaved?.();
    } catch (err) { setError(messageOf(err)); }
    finally { setSaving(false); }
  }

  const compareRows = COMPARE_LABELS
    .map(([key, label]) => [label, (compare?.[key] ?? []).join('、')] as [string, string])
    .filter(([, value]) => value);
  const returnCount = visits.filter((item) => kindOf(item) === 'return').length;
  const visitNo = returnCount + 1;

  return (
    <FormSheet
      open
      title={visitNo > 1 ? `第${visitNo}次复诊` : '复诊'}
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
        value={clinical}
        onChange={(key, next) => setClinical((prev) => ({ ...prev, [key]: next }))}
        tongue={tongueFile}
        onTongue={setTongueFile}
        aiAllowed={aiAllowed}
        saving={saving}
        conditionExtra={(
          <div className="space-y-3 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">只列出本次材料里写明的变化。</p>
              <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => void runCompare()} disabled={!aiAllowed || comparing || saving}>
                <Sparkles className="h-3.5 w-3.5" />
                {comparing ? '对比中…' : '与上次对比'}
              </Button>
            </div>
            {!aiAllowed ? <p className="text-xs text-slate-400">患者未授权 AI，不能自动对比。</p> : null}
            {compare ? (
              compareRows.length ? (
                <div className="space-y-1 text-sm leading-6 text-slate-700">
                  {compareRows.map(([label, value]) => <p key={label}>{label}：{value}</p>)}
                </div>
              ) : <p className="text-sm text-slate-400">本次材料里没有写明变化。</p>
            ) : null}
          </div>
        )}
        planExtra={(
          <div className="space-y-4 border-t border-slate-100 pt-4">
            <Field label="调整说明">
              <Textarea className={`${controlClass} min-h-[84px] resize-y`} rows={3} value={adjustment} onChange={(event) => setAdjustment(event.target.value)} placeholder="本次方案相对上次做了什么调整" />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-500">摘要写入末期情况，确认后可再改字。</p>
              <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => void runSummary()} disabled={!aiAllowed || summarizing || saving}>
                <Sparkles className="h-3.5 w-3.5" />
                {summarizing ? '生成中…' : '生成摘要'}
              </Button>
            </div>
            {!aiAllowed ? <p className="text-xs text-slate-400">患者未授权 AI，请手工填写摘要。</p> : null}
            <Field label="最新摘要">
              <Textarea className={`${controlClass} min-h-[96px] resize-y`} rows={4} value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="确认本次后，这段文字显示在末期卡片" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="下次随访">
                <DatePicker future value={followDate} onChange={setFollowDate} placeholder="选择随访日期" />
              </Field>
            </div>
            <Field label="随访内容">
              <Textarea className={`${controlClass} min-h-[72px] resize-y`} rows={2} value={followNote} onChange={(event) => setFollowNote(event.target.value)} placeholder="下次复诊要观察什么" />
            </Field>
          </div>
        )}
      />
    </FormSheet>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
