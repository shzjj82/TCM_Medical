import type { SessionUser } from '../types';

const AUTH_KEY = 'tcm-auth';
const RETURN_KEY = 'tcm-return';

export interface Session {
  token: string;
  user: SessionUser;
}

export function readSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Session;
    if (!data?.token || !data.user?.id) return null;
    return data;
  } catch {
    return null;
  }
}

function notify() {
  window.dispatchEvent(new Event('tcm-auth'));
}

export function writeSession(session: Session) {
  localStorage.setItem(AUTH_KEY, JSON.stringify(session));
  notify();
}

export function clearSession() {
  localStorage.removeItem(AUTH_KEY);
  notify();
}

export function rememberReturn(path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/login')) return;
  sessionStorage.setItem(RETURN_KEY, path);
}

export function takeReturn(): string {
  const value = sessionStorage.getItem(RETURN_KEY);
  sessionStorage.removeItem(RETURN_KEY);
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/login')) {
    return '/dashboard';
  }
  return value;
}

export function roleLabel(role: SessionUser['role']): string {
  return role === 'assistant' ? '医助' : '医生';
}

export function greetingFor(name: string): string {
  const hour = new Date().getHours();
  const hello = hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  return name ? `${hello}，${name}` : hello;
}
