/** 兼容服务端同时可能返回 snake_case（Skill 同步）与 camelCase（API 写入）字段。 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 注意：入参刻意使用 any —— 服务端实体字段是 interface（不具备隐式索引签名），
 * 若这里声明为 Record<string, any> 会导致大量的 TS2345，反而掩盖真正的问题。
 */
export function pickField<T = any>(source: any, snake: string, camel: string): T | undefined {
  if (!source) return undefined;
  const value = source[snake] ?? source[camel];
  return value === null || value === undefined || value === '' ? undefined : (value as T);
}

export function pickNumber(source: any, snake: string, camel: string): number | undefined {
  const raw = pickField<number | string>(source, snake, camel);
  if (raw === undefined) return undefined;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : undefined;
}

export function pickArray(source: any, key: string, camel = key): string[] {
  const raw = source?.[key] ?? source?.[camel];
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  if (typeof raw === 'string' && raw) return raw.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
  return [];
}

export const VERDICT_TONE: Record<string, 'success' | 'warning' | 'danger' | 'secondary'> = {
  临床痊愈: 'success',
  显效: 'success',
  有效: 'success',
  好转: 'warning',
  无变化: 'secondary',
  加重: 'danger',
  待评估: 'secondary',
};

export function formatPercent(rate?: number): string {
  if (rate === undefined || rate === null) return '—';
  return `${Math.round(rate * 100)}%`;
}
