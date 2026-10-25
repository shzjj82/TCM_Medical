/** 兼容 snake_case（Skill Python 侧）与 camelCase（前端/JSON API）两种命名字段。 */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 默认泛型为 any：Skill 同步过来的 JSON 字段命名不统一（snake/camel 混用），
 * 这里刻意保持宽松，由下游实体列的 nullable 约束来保证数据质量，而不是让编译器误判。
 */
export function pick<T = any>(source: Record<string, any>, keys: string[]): T | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null) return value as T;
  }
  return undefined;
}

export function normalizeDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  // Skill 侧是 ISO datetime/date，PostgreSQL date 列只取前 10 位
  return value.slice(0, 10);
}

export function toArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v));
  if (typeof value === 'string' && value) return value.split(/[,，、/|]+/).map((v) => v.trim()).filter(Boolean);
  return [];
}

export function toKeywords(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[\s,，、。;；:：/|()（）]+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2)
        .slice(0, 24),
    ),
  );
}
