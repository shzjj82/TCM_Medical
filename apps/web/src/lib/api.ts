import type { AdviseResult, CaseRecord, Patient, SkillSummary, Visit } from '../types';

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

const BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`${res.status} ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => request<{ ok: boolean; ai: Record<string, unknown> }>('/health'),

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

  parseNote: (payload: { text?: string; doctorNote?: string }) =>
    request<Record<string, unknown>>('/ai/parse', { method: 'POST', body: JSON.stringify(payload) }),

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
