import type { AdviseResult, Patient, SkillSummary, Visit } from '../types';

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

  listPatients: (keyword?: string, status?: string) =>
    request<Patient[]>(`/patients${qs({ q: keyword, status })}`),

  getPatient: (key: string) => request<Patient>(`/patients/${encodeURIComponent(key)}`),

  syncPatient: (payload: Partial<Patient>) =>
    request<Patient>('/patients/sync', { method: 'POST', body: JSON.stringify(payload) }),

  listVisits: (patientId: string) => request<Visit[]>(`/visits${qs({ patientId })}`),

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
