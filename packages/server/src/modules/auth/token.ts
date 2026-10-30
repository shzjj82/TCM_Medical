import { createHmac, timingSafeEqual } from 'crypto';

export interface TokenUser {
  id: string;
  username: string;
  name: string;
  role: 'doctor' | 'assistant';
  title: string;
}

interface TokenPayload extends TokenUser {
  exp: number;
}

function secret(): string {
  return process.env.AUTH_SECRET ?? 'tcm-dev-auth-secret-change-me';
}

function sign(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function equal(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function signToken(user: TokenUser, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ ...user, exp: Date.now() + ttlMs })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string): TokenUser | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!equal(sign(payload), sig)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as TokenPayload;
    if (!data?.id || !data.username || !data.exp || data.exp < Date.now()) return null;
    if (data.role !== 'doctor' && data.role !== 'assistant') return null;
    return {
      id: data.id,
      username: data.username,
      name: data.name,
      role: data.role,
      title: data.title ?? '',
    };
  } catch {
    return null;
  }
}
