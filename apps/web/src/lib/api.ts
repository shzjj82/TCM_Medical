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
const BIZ_CODE = (import.meta.env.VITE_BIZ_CODE as string | undefined) ?? 'medical';

function authHeader(): Record<string, string> {
  const token = readSession()?.token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function isEnvelope(value: unknown): value is { success: boolean; message?: string | string[]; data?: unknown } {
  return Boolean(value && typeof value === 'object' && 'success' in value && 'data' in value);
}

function envelopeMessage(value: { message?: string | string[] }): string | undefined {
  if (typeof value.message === 'string' && value.message) return value.message;
  if (Array.isArray(value.message) && value.message.length) return value.message.map(String).join('；');
  return undefined;
}

function errorText(raw: unknown, fallback: string): string {
  if (isEnvelope(raw)) return envelopeMessage(raw) || fallback;
  if (raw && typeof raw === 'object' && 'message' in raw) {
    return envelopeMessage(raw as { message?: string | string[] }) || fallback;
  }
  return fallback;
}

function kickAuth(status: number, path: string) {
  if (status === 401 && path !== '/auth/login') {
    clearSession();
    if (window.location.pathname !== '/login') {
      const here = `${window.location.pathname}${window.location.search}`;
      window.history.replaceState(null, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
      try { sessionStorage.setItem('tcm-return', here.startsWith('/login') ? '/patients' : here); } catch { /* ignore */ }
    }
  }
  if (status === 403 && window.location.pathname !== '/403') {
    window.history.replaceState(null, '', '/403');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init?.body instanceof FormData;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(isForm ? {} : { 'Content-Type': 'application/json' }),
      'X-Biz-Code': BIZ_CODE,
      ...authHeader(),
      ...(init?.headers ?? {}),
    },
  });
  kickAuth(res.status, path);
  const raw: unknown = await res.json().catch(() => null);
  if (!res.ok || (isEnvelope(raw) && raw.success === false)) {
    throw new Error(errorText(raw, `${res.status}`));
  }
  return (isEnvelope(raw) ? raw.data : raw) as T;
}

export interface ChatReply {
  mode: 'llm' | 'rule_based' | 'rule_based_fallback';
  conclusion: string;
  evidence: string[];
  citations: Array<{ kind: string; title: string; note?: string }>;
  risks: string[];
  missing: string[];
  disclaimer: string;
}

type ChatPayload = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  patientId?: string;
  scopes?: { patient?: boolean; internal?: boolean; external?: boolean };
  answerMode?: 'summary' | 'review' | 'advise' | 'teach';
};

async function chatStream(
  payload: ChatPayload,
  onEvent: (event: { delta?: string; reply?: ChatReply }) => void,
): Promise<ChatReply> {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
      'X-Biz-Code': BIZ_CODE,
      ...authHeader(),
    },
    body: JSON.stringify(payload),
  });
  kickAuth(res.status, '/ai/chat');
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok) {
    const raw: unknown = await res.json().catch(() => null);
    throw new Error(errorText(raw, `${res.status}`));
  }
  if (!type.includes('text/event-stream')) {
    const raw: unknown = await res.json().catch(() => null);
    const data = (isEnvelope(raw) ? raw.data : raw) as ChatReply;
    if (!data?.conclusion && isEnvelope(raw) && raw.success === false) {
      throw new Error(errorText(raw, `${res.status}`));
    }
    onEvent({ reply: data });
    return data;
  }
  if (!res.body) throw new Error('对话没有返回结果');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: ChatReply | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\n\n/);
    buffer = blocks.pop() ?? '';
    for (const block of blocks) {
      for (const line of block.split(/\n/)) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        let parsed: { delta?: string; reply?: ChatReply; error?: string };
        try { parsed = JSON.parse(data) as { delta?: string; reply?: ChatReply; error?: string }; }
        catch { continue; }
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.delta) onEvent({ delta: parsed.delta });
        if (parsed.reply) {
          final = parsed.reply;
          onEvent({ reply: parsed.reply });
        }
      }
    }
  }
  if (!final) throw new Error('对话没有返回结果');
  return final;
}

export const api = {
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

  chatStream,

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

  uploadTongue: (file: File, name?: string) => {
    const body = new FormData();
    body.append('file', file);
    if (name) body.append('name', name);
    return request<{ url: string; name: string }>('/files/tongue', { method: 'POST', body });
  },

  uploadAssist: (file: File, name?: string) => {
    const body = new FormData();
    body.append('file', file);
    if (name) body.append('name', name);
    return request<{ url: string; name: string }>('/files/assist', { method: 'POST', body });
  },

  /** 超过 8MB 的音频直传对象存储，返回听悟可读地址。 */
  uploadAudio: (file: File) => {
    const body = new FormData();
    body.append('file', file);
    body.append('name', file.name);
    return request<{ url: string; name: string; key: string }>('/files/audio', { method: 'POST', body });
  },

  /** 上传录音。短录音直接返回转写；长音频走听悟时先返回任务号。 */
  transcribeIntake: (payload: { audioBase64?: string; mime?: string; fileUrl?: string; provider?: string; transcript?: string }) =>
    request<{ transcript?: string; fields?: Record<string, unknown>; jobId?: string; status?: string; provider?: string }>('/ai/intake-audio', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getMediaJob: (id: string) =>
    request<{ jobId: string; status: string; provider?: string; transcript?: string; error?: string }>(
      `/ai/jobs/${encodeURIComponent(id)}`,
    ),

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
