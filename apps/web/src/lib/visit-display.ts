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

export interface VisitMedia {
  kind: string;
  name: string;
  url: string;
  source?: string;
}

function fileNameOf(url: string): string {
  try {
    const path = new URL(url, 'http://local').pathname;
    return decodeURIComponent(path.split('/').filter(Boolean).pop() ?? '') || '附件';
  } catch {
    return '附件';
  }
}

function inferKind(url: string, name = ''): string {
  const hay = `${url} ${name}`.toLowerCase();
  if (/舌|tongue|\.(png|jpe?g|gif|webp|bmp|heic|svg)(\?|$)/i.test(hay)) return 'image';
  if (/语音|audio|voice|\.(mp3|wav|m4a|aac|ogg|webm)(\?|$)/i.test(hay)) return 'audio';
  return 'file';
}

export function visitMedia(visit?: Visit): VisitMedia[] {
  const list = visit?.raw?.media;
  if (!Array.isArray(list)) return [];
  const files: VisitMedia[] = [];
  for (const item of list) {
    if (typeof item === 'string') {
      const url = item.trim();
      if (url) files.push({ kind: inferKind(url), name: fileNameOf(url), url });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const url = String(rec.url ?? rec.href ?? rec.path ?? '').trim();
    if (!url) continue;
    const name = String(rec.name ?? rec.filename ?? fileNameOf(url)).trim() || '附件';
    files.push({
      kind: String(rec.kind ?? rec.type ?? '').trim() || inferKind(url, name),
      name,
      url,
      source: String(rec.source ?? '').trim() || undefined,
    });
  }
  return files;
}

export function isImageMedia(file: VisitMedia): boolean {
  if (file.kind === 'assist') return false;
  if (/image|photo|picture|ocr|舌|tongue/i.test(`${file.kind} ${file.name}`)) return true;
  return /\.(png|jpe?g|gif|webp|bmp|heic|svg)(\?|$)/i.test(file.url);
}

export function isAudioMedia(file: VisitMedia): boolean {
  if (/audio|voice|speech|语音/i.test(`${file.kind} ${file.source ?? ''} ${file.name}`)) return true;
  return /\.(mp3|wav|m4a|aac|ogg|webm)(\?|$)/i.test(file.url);
}

export function visitImages(visit?: Visit): VisitMedia[] {
  return visitMedia(visit).filter(isImageMedia);
}

export function visitAssistMedia(visit?: Visit): VisitMedia[] {
  return visitMedia(visit).filter((file) => file.kind === 'assist');
}
