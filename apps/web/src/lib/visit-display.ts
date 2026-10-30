import { Image as ImageIcon, Mic } from 'lucide-react';
import { pickArray, pickField, pickNumber } from './coerce';
import type { Visit } from '../types';

export function day(value?: string): string {
  if (!value) return '—';
  return String(value).slice(0, 10);
}

export function text(value?: string | number | null): string {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (!raw || raw === '（未记录）') return '';
  return raw;
}

export function channelIcons(channels: string[]) {
  const joined = channels.join(' ').toLowerCase();
  const icons = [];
  if (/voice|audio|speech|语音/.test(joined)) icons.push(Mic);
  if (/image|photo|picture|ocr|舌/.test(joined)) icons.push(ImageIcon);
  return icons;
}

export function analysisOf(visit: Visit): string {
  const outcome = visit.outcome ?? {};
  const parsed = visit.parsed ?? {};
  const conclusion = text(pickField<string>(outcome, 'doctor_conclusion', 'doctorConclusion'))
    || text(pickField<string>(parsed, 'narrative', 'narrative'));
  if (conclusion) return conclusion;
  const score = pickNumber(outcome, 'severity_score', 'severityScore');
  return score === undefined ? '—' : `严重度 ${score}`;
}

export function planOf(visit: Visit): string {
  const diagnosis = (visit.diagnosis ?? {}) as Record<string, unknown>;
  const bit = (value: unknown) => {
    if (Array.isArray(value)) return value.map((item) => text(String(item))).filter(Boolean).join('、');
    return text(typeof value === 'string' ? value : '');
  };
  const plan = [bit(diagnosis.principle ?? diagnosis.treatmentPrinciple), bit(diagnosis.acupoints), bit(diagnosis.prescriptions)]
    .filter(Boolean)
    .join('；');
  return text(visit.doctorNote) || plan || text(visit.chiefComplaint) || text(visit.presentIllness) || '—';
}

export function followOf(visit: Visit): string {
  return text(pickField<string>(visit.outcome ?? {}, 'next_plan', 'nextPlan'));
}

export function linesOf(pairs: Array<[string, string]>) {
  return pairs.filter(([, value]) => value);
}

export function symptomText(parts: Array<string | undefined>): string {
  const unique = parts.map((item) => text(item)).filter(Boolean);
  return [...new Set(unique)].join('，');
}

export function visitSymptoms(visit?: Visit): { symptoms: string; tongue: string; pulse: string } {
  const sources = [visit?.parsed, visit?.outcome];
  const symptoms = sources.flatMap((source) => [
    ...pickArray(source, 'symptoms'),
    text(pickField<string>(source, 'chief_complaint', 'chiefComplaint')),
  ]);
  const tongue = sources.map((source) => text(pickField<string>(source, 'tongue', 'tongue'))).find(Boolean) ?? '';
  const pulse = sources.map((source) => text(pickField<string>(source, 'pulse', 'pulse'))).find(Boolean) ?? '';
  return { symptoms: symptomText(symptoms), tongue, pulse };
}

export function present(lines: Array<[string, string]>): Array<[string, string]> {
  return lines.filter(([, value]) => {
    const raw = value.trim();
    return Boolean(raw) && raw !== '—' && raw !== '-';
  });
}
