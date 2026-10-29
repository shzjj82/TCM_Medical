/** 一位患者只有一个疾病，取最早建立的那一份。 */
export function soleCase<T extends { caseNo?: number; createdAt?: string }>(cases: T[]): T | undefined {
  if (!cases.length) return undefined;
  return [...cases].sort(
    (a, b) => (a.caseNo ?? 0) - (b.caseNo ?? 0) || String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')),
  )[0];
}
