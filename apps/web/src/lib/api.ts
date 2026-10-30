import type { AdviseResult, CaseRecord, Patient, SessionUser, SkillSummary, Visit } from '../types';
import { clearSession, readSession } from './session';

export interface PatientFacets {
  diseases: string[];
  syndromes: string[];
  tags: string[];
  doctors: string[];
}

export interface DuplicatePatient {
  id: string;
  externalId?: string;
  name: string;
  phone?: string;
  gender?: string;
  age?: number;
  doctor?: string;
  visitCount: number;
  tags: string[];
}

export interface DuplicateGroup {
  reason: string;
  patients: DuplicatePatient[];
}

export interface DashboardPatientRef {
  id: string;
  externalId?: string;
  name: string;
  gender?: string;
  age?: number;
}

export interface DashboardVisitRow {
  id: string;
  visitNo: number;
  date: string;
  kind?: string | null;
  reviewStatus: string;
  patient: DashboardPatientRef | null;
}

export interface DashboardSummary {
  today: { total: number; items: Patient[] };
  pendingReturn: { total: number };
  pendingFollowup: { total: number };
  pendingAiReview: { total: number; items: DashboardVisitRow[] };
  pendingKnowledge: { total: number };
  recent: { total: number; items: Patient[] };
}

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

function authHeader(): Record<string, string> {
  const token = readSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readError(res: Response): Promise<string> {
  const detail = await res.text();
  try {
    const body = JSON.parse(detail) as { message?: string | string[] };
    if (typeof body.message === 'string' && body.message) return body.message;
    if (Array.isArray(body.message) && body.message.length) return body.message.join('；');
  } catch {
    /* 非 JSON 时退回原文 */
  }
  return detail.slice(0, 200) || `${res.status}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401 && path !== '/auth/login') {
    clearSession();
    if (window.location.pathname !== '/login') {
      const here = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
      try { sessionStorage.setItem('tcm-return', here.startsWith('/login') ? '/patients' : here); } catch { /* ignore */ }
    }
  }
  if (res.status === 403 && window.location.pathname !== '/403') {
    window.history.replaceState(null, '', '/403');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
  if (!res.ok) throw new Error(await readError(res));
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; ai: Record<string, unknown> }>('/health'),

  login: (username: string, password: string) =>
    request<{ token: string; user: SessionUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<SessionUser>('/auth/me'),

  dashboard: () => request<DashboardSummary>('/dashboard'),

  listPatients: (params?: {
    keyword?: string;
    status?: string;
    page?: number;
    pageSize?: number;
    disease?: string;
    syndrome?: string;
    course?: string;
    tag?: string;
    doctor?: string;
    visit?: string;
    view?: string;
  }) =>
    request<{ items: Patient[]; total: number; page: number; pageSize: number }>(
      `/patients${qs({
        q: params?.keyword,
        status: params?.status,
        page: params?.page,
        pageSize: params?.pageSize,
        disease: params?.disease,
        syndrome: params?.syndrome,
        course: params?.course,
        tag: params?.tag,
        doctor: params?.doctor,
        visit: params?.visit,
        view: params?.view,
      })}`,
    ),

  patientFacets: () => request<PatientFacets>('/patients/facets'),

  patientDuplicates: () => request<DuplicateGroup[]>('/patients/duplicates'),

  mergePatients: (primaryId: string, duplicateId: string) =>
    request<Patient>('/patients/merge', { method: 'POST', body: JSON.stringify({ primaryId, duplicateId }) }),

  getPatient: (key: string) => request<Patient>(`/patients/${encodeURIComponent(key)}`),

  updatePatient: (key: string, payload: Record<string, unknown>) =>
    request<Patient>(`/patients/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  syncPatient: (payload: Partial<Patient>) =>
    request<Patient>('/patients/sync', { method: 'POST', body: JSON.stringify(payload) }),

  listVisits: (patientId: string) => request<Visit[]>(`/visits${qs({ patientId })}`),

  // ---------- 就诊档案（疾病信息） ----------
  listCases: (patientKey: string) => request<CaseRecord[]>(`/cases${qs({ patientId: patientKey })}`),

  /** 已归档档案列表（内部知识库数据源，带出病患信息）。 */
  listArchivedCases: () => request<CaseRecord[]>('/cases?status=archived'),

  getCase: (key: string) => request<CaseRecord>(`/cases/${encodeURIComponent(key)}`),

  createCase: (payload: Record<string, unknown>) =>
    request<CaseRecord>('/cases', { method: 'POST', body: JSON.stringify(payload) }),

  updateCase: (key: string, payload: Record<string, unknown>) =>
    request<CaseRecord>(`/cases/${encodeURIComponent(key)}`, { method: 'PATCH', body: JSON.stringify(payload) }),

  addCaseVisit: (caseKey: string, payload: Record<string, unknown>) =>
    request<Visit>(`/cases/${encodeURIComponent(caseKey)}/visits`, { method: 'POST', body: JSON.stringify(payload) }),

  archiveCase: (caseKey: string) =>
    request<CaseRecord>(`/cases/${encodeURIComponent(caseKey)}/archive`, { method: 'POST' }),

  reviewVisit: (externalId: string, status: 'confirmed' | 'rejected') =>
    request<Visit>(`/visits/${encodeURIComponent(externalId)}/review`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),

  advise: (payload: { text?: string; patientId?: string; topK?: number }) =>
    request<AdviseResult>('/ai/advise', { method: 'POST', body: JSON.stringify(payload) }),

  chat: (payload: {
    message: string;
    history?: Array<{ role: 'user' | 'assistant'; content: string }>;
    patientId?: string;
    scopes?: { patient?: boolean; internal?: boolean; external?: boolean };
    answerMode?: 'summary' | 'review' | 'advise' | 'teach';
  }) =>
    request<{
      mode: 'llm' | 'rule_based' | 'rule_based_fallback';
      conclusion: string;
      evidence: string[];
      citations: Array<{ kind: string; title: string; note?: string }>;
      risks: string[];
      missing: string[];
      disclaimer: string;
    }>('/ai/chat', { method: 'POST', body: JSON.stringify(payload) }),

  parseNote: (payload: { text?: string; doctorNote?: string }) =>
    request<Record<string, unknown>>('/ai/parse', { method: 'POST', body: JSON.stringify(payload) }),

  compareVisit: (payload: { previous?: string; current?: string }) =>
    request<{ improved: string[]; worsened: string[]; added: string[]; resolved: string[]; unchanged: string[] }>(
      '/ai/compare',
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  summarizeVisit: (payload: { previous?: string; current?: string }) =>
    request<{ summary: string }>('/ai/summary', { method: 'POST', body: JSON.stringify(payload) }),

  extractSection: (payload: { text: string; section: 'chart' | 'condition' | 'plan' }) =>
    request<{ section: string; fields: Record<string, string> }>('/ai/extract', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  uploadTongue: (payload: { imageBase64: string; mime: string; name: string }) =>
    request<{ url: string; name: string }>('/files/tongue', { method: 'POST', body: JSON.stringify(payload) }),

  /** 上传录音，返回转写和拆好的主诉字段。不直接建档。 */
  transcribeIntake: (payload: { audioBase64: string; mime: string }) =>
    request<{ transcript: string; fields: Record<string, unknown> }>('/ai/intake-audio', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  searchKnowledge: (scope: 'external' | 'internal', q: string, topK = 8) =>
    request<Array<Record<string, unknown>>>(`/knowledge/${scope}${qs({ q, topK })}`),

  syncExternalReference: (payload: Record<string, unknown>) =>
    request<Record<string, unknown>>('/knowledge/external/sync', { method: 'POST', body: JSON.stringify(payload) }),

  listSkills: () => request<SkillSummary[]>('/skills/triggers'),

  runSkill: (tool: string, params: Record<string, unknown>) =>
    request<unknown>('/skills/run', { method: 'POST', body: JSON.stringify({ tool, params }) }),

  agentChat: (message: string) =>
    request<{ text: string; mode: string; steps: Array<{ tool: string; command: string; output: string }> }>(
      '/skills/chat',
      { method: 'POST', body: JSON.stringify({ message }) },
    ),
};

function qs(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : '';
}
