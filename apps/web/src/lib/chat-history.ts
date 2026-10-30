import type { Patient } from '../types';

const KEY = 'tcm-chat-history';
const MAX = 50;

export interface StoredMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  reply?: {
    mode: 'llm' | 'rule_based' | 'rule_based_fallback';
    conclusion: string;
    evidence: string[];
    citations: Array<{ kind: string; title: string; note?: string }>;
    risks: string[];
    missing: string[];
    disclaimer: string;
  };
}

export interface ChatThread {
  id: string;
  title: string;
  updatedAt: string;
  patientName?: string;
  patient?: Patient | null;
  scopes: { patient: boolean; internal: boolean; external: boolean };
  answerMode: 'summary' | 'review' | 'advise' | 'teach';
  messages: StoredMessage[];
}

export function readThreads(): ChatThread[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as ChatThread[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function upsertThread(thread: ChatThread): ChatThread[] {
  const next = [thread, ...readThreads().filter((item) => item.id !== thread.id)].slice(0, MAX);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function removeThread(id: string): ChatThread[] {
  const next = readThreads().filter((item) => item.id !== id);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

export function titleFrom(messages: StoredMessage[]): string {
  const first = messages.find((item) => item.role === 'user')?.text.trim() || '未命名对话';
  return first.length > 32 ? `${first.slice(0, 32)}…` : first;
}
