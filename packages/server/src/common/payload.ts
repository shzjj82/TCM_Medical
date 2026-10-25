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

/**
 * 判断字符串是否是合法 UUID。
 *
 * 必须用它在查询前兜一道：`patients.id` 是 uuid 列，把姓名或 `P-2026-001` 这类
 * 外部 ID 直接塞进 `WHERE id = ?` 会让 PostgreSQL 抛
 * `invalid input syntax for type uuid`，整个请求 500。
 */
export function isUuid(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
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
