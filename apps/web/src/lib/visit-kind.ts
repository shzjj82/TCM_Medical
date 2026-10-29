export type VisitKind = 'first' | 'return' | 'close' | 'refer' | 'follow';

const LABELS: Record<VisitKind, string> = {
  first: '初诊',
  return: '复诊',
  close: '结案',
  refer: '转诊',
  follow: '随访',
};

export function kindOf(visit: { kind?: string | null; visitNo?: number }): VisitKind {
  if (visit.kind === 'first' || visit.kind === 'return' || visit.kind === 'close' || visit.kind === 'refer' || visit.kind === 'follow') {
    return visit.kind;
  }
  return (visit.visitNo ?? 1) <= 1 ? 'first' : 'return';
}

export function isTreatment(kind: VisitKind): boolean {
  return kind === 'first' || kind === 'return';
}

export function visitLabel(
  visit: { kind?: string | null; visitNo?: number },
  visits: Array<{ kind?: string | null; visitNo?: number }>,
): string {
  const kind = kindOf(visit);
  if (kind !== 'return') return LABELS[kind];
  const index = visits.filter((item) => kindOf(item) === 'return' && (item.visitNo ?? 0) <= (visit.visitNo ?? 0)).length;
  return index > 1 ? `第${index}次复诊` : '复诊';
}

export function courseEnded(
  record: { status?: string; courseEnd?: string | null } | undefined,
  visits: Array<{ kind?: string | null; visitNo?: number }>,
): boolean {
  if (!record) return false;
  if (record.status === 'archived' || record.courseEnd === 'closed' || record.courseEnd === 'referred') return true;
  return visits.some((item) => {
    const kind = kindOf(item);
    return kind === 'close' || kind === 'refer';
  });
}
