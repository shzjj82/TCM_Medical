import { useMemo, useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { FormSheet } from './ui/form-sheet';
import { splitList } from './CaseForm';
import { CLINICAL_TABS, ClinicalEntry, clinicalTabIssue, nextClinicalTab, uploadTongue, type ClinicalTab, type ClinicalValue, type TongueDraft } from './ClinicalEntry';
import { api } from '../lib/api';
import { pickField } from '../lib/coerce';
import { kindOf } from '../lib/visit-kind';
import type { CaseRecord, Visit } from '../types';

type Focus = 'visit' | 'follow';

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const caseKey = caseRecord.externalId ?? caseRecord.id;
  const nextTab = nextClinicalTab(tab);

  function goTab(next: ClinicalTab) {
    const forward = CLINICAL_TABS.indexOf(next) > CLINICAL_TABS.indexOf(tab);
    if (forward) {
      const issue = clinicalTabIssue(tab, clinical);
      if (issue) {
        setError(issue);
        return;
      }
    }
    setError(null);
    setTab(next);
  }

  function goNext() {
    const issue = clinicalTabIssue(tab, clinical);
    if (issue) {
      setError(issue);
      return;
    }
    if (nextTab) {
      setError(null);
      setTab(nextTab);
      return;
    }
    void submit(true);
  }

  function currentText(): string {
    return [
      clinical.chiefComplaint,
      clinical.presentIllness,
      clinical.symptoms,
      clinical.tongue && `舌象 ${clinical.tongue}`,
      clinical.pulse && `脉象 ${clinical.pulse}`,
    ].map((item) => clean(item)).filter(Boolean).join('\n');
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
    const doctorNote = clinical.tcmSyndrome.trim() && clinical.tcmSyndrome.trim() !== previous.syndrome
      ? `证型：${clinical.tcmSyndrome.trim()}`
      : '';
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
        },
        media: uploaded ? [{ kind: 'tongue', name: uploaded.name, url: uploaded.url }] : [],
        channels: uploaded ? ['image'] : [],
        aiMode: 'manual',
        kind: 'return',
        reviewStatus: confirm ? 'confirmed' : 'pending',
        keepSummary: true,
      });
      if (tongueFile) URL.revokeObjectURL(tongueFile.preview);
      await onSaved?.();
    } catch (err) { setError(messageOf(err)); }
    finally { setSaving(false); }
  }

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
            <Button type="button" onClick={goNext} disabled={saving}>{saving ? '保存中…' : nextTab ? '下一步' : '保存'}</Button>
          </div>
        </div>
      )}
    >
      <ClinicalEntry
        tab={tab}
        onTab={goTab}
        value={clinical}
        onChange={(key, next) => setClinical((prev) => ({ ...prev, [key]: next }))}
        tongue={tongueFile}
        onTongue={setTongueFile}
        aiAllowed={aiAllowed}
        saving={saving}
      />
    </FormSheet>
  );
}
