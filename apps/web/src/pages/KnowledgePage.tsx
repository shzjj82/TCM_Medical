import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { EmptyState } from '../components/ui/empty-state';
import { KnowledgeListSkeleton } from '../components/ui/skeleton';
import { FormSheet } from '../components/ui/form-sheet';
import { Input, Label, Textarea } from '../components/ui/input';
import { Scrollbar } from '../components/ui/scrollbar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { useTabUnderline } from '../components/ui/tabs';
import { api } from '../lib/api';
import { pickField, pickNumber } from '../lib/coerce';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '../lib/route';
import type { CaseRecord, KnowledgeRow } from '../types';

const DESKTOP_QUERY = '(min-width: 768px)';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

const LIBRARIES = [
  { id: 'internal', label: '内部治疗资料库' },
  { id: 'external', label: '外部治疗参考资料库' },
] as const;

type LibraryId = (typeof LIBRARIES)[number]['id'];

const INTERNAL_VIEWS = [
  { id: '', label: '全部' },
  { id: 'protocol', label: '病症经验' },
  { id: 'case', label: '脱敏医案' },
] as const;

const SOURCE_TYPES = ['中医经典', '教材', '临床指南', '专家经验', '学术论文', '培训材料', '医生手工整理资料', '其他参考资料'];
const EVIDENCE_LEVELS = ['经典原文', '指南推荐', '专家经验', '病例报告', '未分级'];

type Detail =
  | { kind: 'protocol'; row: KnowledgeRow }
  | { kind: 'case'; row: CaseRecord }
  | { kind: 'external'; row: KnowledgeRow };

type ListItem =
  | { kind: 'protocol'; row: KnowledgeRow; key: string }
  | { kind: 'case'; row: CaseRecord; key: string }
  | { kind: 'external'; row: KnowledgeRow; key: string };

interface Props {
  onOpenCase?: (caseKey: string, patientKey: string) => void;
}

/** 知识库：内部治疗资料与外部参考分库，条目可检索、可查看；外部资料支持手工录入。 */
export function KnowledgePage(_props: Props) {
  const [library, setLibrary] = useState<LibraryId>('internal');
  const [internalView, setInternalView] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [protocols, setProtocols] = useState<KnowledgeRow[]>([]);
  const [references, setReferences] = useState<KnowledgeRow[]>([]);
  const [archives, setArchives] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [mobileCount, setMobileCount] = useState(DEFAULT_PAGE_SIZE);
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { barRef, indicator } = useTabUnderline(library, '#175055');

  const load = async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const [internal, external, cases] = await Promise.all([
        api.searchKnowledge('internal', query, 500),
        api.searchKnowledge('external', query, 500),
        api.listArchivedCases().catch(() => [] as CaseRecord[]),
      ]);
      setProtocols(internal);
      setReferences(external);
      setArchives(query.trim()
        ? cases.filter((row) => haystackOfCase(row).includes(query.trim()))
        : cases);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(''); }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (keyword === q) return;
      setQ(keyword);
      setPage(1);
      setMobileCount(pageSize);
      void load(keyword);
    }, 280);
    return () => window.clearTimeout(timer);
  }, [keyword, q, pageSize]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const items = useMemo((): ListItem[] => {
    if (library === 'internal') {
      const protocolCards: ListItem[] = protocols.map((row) => ({ kind: 'protocol', row, key: `p-${row.id}` }));
      const caseCards: ListItem[] = archives.map((row) => ({ kind: 'case', row, key: `c-${row.id}` }));
      if (internalView === 'protocol') return protocolCards;
      if (internalView === 'case') return caseCards;
      return [...protocolCards, ...caseCards];
    }
    const rows = sourceType
      ? references.filter((row) => String(payloadOf(row).sourceType ?? '') === sourceType)
      : references;
    return rows.map((row) => ({ kind: 'external', row, key: `e-${row.id}` }));
  }, [archives, internalView, library, protocols, references, sourceType]);

  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const view = desktop
    ? items.slice((safePage - 1) * pageSize, safePage * pageSize)
    : items.slice(0, Math.min(mobileCount, total));

  useEffect(() => {
    setPage(1);
    setMobileCount(pageSize);
  }, [library, internalView, sourceType, pageSize]);

  useEffect(() => {
    if (desktop) return;
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target || loading || total === 0) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setMobileCount((current) => (current >= total ? current : current + pageSize));
    }, { root, rootMargin: '160px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [desktop, loading, pageSize, total, view.length]);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="hidden min-w-0 md:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">知识库</h1>
          <p className="mt-1 hidden text-xs text-slate-400 2xl:block">内部经验与外部资料分库保存，检索与引用时分开标识</p>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-[240px] md:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="病名 / 证型 / 穴位 / 方剂"
              className="h-9 border-slate-200 bg-slate-50/80 pl-8"
            />
          </div>
          {library === 'external' ? (
            <Button size="icon" className="shrink-0 rounded-lg md:hidden" aria-label="录入资料" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />
            </Button>
          ) : null}
          {library === 'external' ? (
            <Button className="hidden md:inline-flex" onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" />录入资料
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-end border-b border-slate-100">
        <div ref={barRef} className="relative flex min-w-0 flex-1 gap-6">
          {LIBRARIES.map((item) => (
            <button
              key={item.id}
              type="button"
              data-tab={item.id}
              onClick={() => setLibrary(item.id)}
              className={`shrink-0 pb-2 text-sm transition-colors duration-200 ${
                library === item.id ? 'font-medium text-[#175055]' : 'text-slate-500'
              }`}
            >
              {item.label}
            </button>
          ))}
          {indicator}
        </div>
      </div>

      {library === 'internal' ? (
        <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain">
          {INTERNAL_VIEWS.map((item) => (
            <FilterPill key={item.label} label={item.label} active={internalView === item.id} onClick={() => setInternalView(item.id)} />
          ))}
        </div>
      ) : (
        <div className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto overflow-y-hidden overscroll-x-contain">
          <FilterPill label="全部" active={!sourceType} onClick={() => setSourceType('')} />
          {SOURCE_TYPES.map((item) => (
            <FilterPill key={item} label={item} active={sourceType === item} onClick={() => setSourceType(item)} />
          ))}
        </div>
      )}

      {error ? <Alert className="shrink-0" tone="danger">{error}</Alert> : null}

      <Scrollbar ref={listRef} className="min-h-0 flex-1" viewportClassName="flex min-h-full flex-col overscroll-contain">
        {loading && !protocols.length && !references.length && !archives.length ? (
          <KnowledgeListSkeleton />
        ) : total === 0 ? (
          <EmptyState
            kind={library === 'internal'
              ? (q || internalView ? 'search' : 'empty')
              : (q || sourceType ? 'search' : 'empty')}
            text={library === 'internal'
              ? (q || internalView ? '没有匹配的内部资料' : '暂无内部资料。结案归档后会沉淀脱敏医案。')
              : (q || sourceType ? '没有匹配的外部资料' : '暂无外部参考。可录入经典、教材或指南。')}
          />
        ) : (
          <div className="flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-1">
            {view.map((item) => {
              if (item.kind === 'protocol') return <ProtocolCard key={item.key} row={item.row} onOpen={() => setDetail({ kind: 'protocol', row: item.row })} />;
              if (item.kind === 'case') return <CaseCard key={item.key} row={item.row} onOpen={() => setDetail({ kind: 'case', row: item.row })} />;
              return <ExternalCard key={item.key} row={item.row} onOpen={() => setDetail({ kind: 'external', row: item.row })} />;
            })}
            {desktop ? null : (
              <div ref={sentinelRef} className="py-3 text-center text-xs text-slate-400">
                {view.length >= total ? '没有更多了' : '上滑加载更多'}
              </div>
            )}
          </div>
        )}
      </Scrollbar>
      {desktop && total > 0 ? (
        <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-slate-500">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <span className="shrink-0">每页</span>
            <Select value={String(pageSize)} onValueChange={(value) => setPageSize(Number(value))}>
              <SelectTrigger aria-label="每页条数" className="h-8 w-[4.75rem] px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((size) => (
                  <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button variant="outline" className="h-8 border-slate-200 px-2" disabled={safePage <= 1 || loading} onClick={() => setPage(safePage - 1)}>
                上一页
              </Button>
              {Array.from({ length: pageCount }, (_, index) => index + 1).filter((item) => Math.abs(item - safePage) <= 2 || item === 1 || item === pageCount).map((item) => (
                <button
                  key={item}
                  type="button"
                  disabled={loading}
                  onClick={() => setPage(item)}
                  className={`h-8 min-w-8 rounded-md px-2 ${item === safePage ? 'bg-[#175055] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  {item}
                </button>
              ))}
              <Button variant="outline" className="h-8 border-slate-200 px-2" disabled={safePage >= pageCount || loading} onClick={() => setPage(safePage + 1)}>
                下一页
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {detail ? <KnowledgeDetail detail={detail} onClose={() => setDetail(null)} /> : null}
      {showCreate ? (
        <ReferenceForm
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false);
            setLibrary('external');
            void load(q);
          }}
        />
      ) : null}
    </div>
  );
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
        active ? 'bg-[#175055] text-white' : 'bg-[#f3f6f7] text-slate-600 hover:bg-[#e7eef1]'
      }`}
    >
      {label}
    </button>
  );
}

function ProtocolCard({ row, onOpen }: { row: KnowledgeRow; onOpen: () => void }) {
  const data = payloadOf(row);
  const count = Number(data.patientCount ?? 0);
  const visits = Number(data.visitCount ?? 0);
  const rate = Number(data.effectiveRate ?? 0);
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{row.title || '未命名经验'}</p>
        <span className="shrink-0 rounded-full bg-[#e7f4f2] px-2 py-0.5 text-[11px] text-[#175055]">病症经验</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {[text(data.tcmDisease), text(data.tcmSyndrome)].filter((item) => item !== '—').join(' · ') || '—'}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        样本量 {count} 例
        {visits ? ` · 治疗 ${visits} 次` : ''}
        {rate > 0 ? ` · 有效 ${Math.round(rate * 100)}%` : ''}
      </p>
      <Pills items={tagsOf(data)} />
    </button>
  );
}

function CaseCard({ row, onOpen }: { row: CaseRecord; onOpen: () => void }) {
  const plan = row.treatmentPlan ?? {};
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">
          {row.tcmDisease || '未命名病'}
          {row.tcmSyndrome ? <span className="ml-1 font-normal text-slate-400">（{row.tcmSyndrome}）</span> : null}
        </p>
        <span className="shrink-0 rounded-full bg-[#f3f6f7] px-2 py-0.5 text-[11px] text-slate-500">脱敏医案</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {maskName(patientOf(row)?.name)} · 治疗 {row.visitCount ?? 0} 次
      </p>
      {row.chiefComplaint ? <p className="mt-2 line-clamp-1 text-sm text-slate-600">{row.chiefComplaint}</p> : null}
      <Pills items={[...(plan.acupoints ?? []).slice(0, 6), ...(plan.prescriptions ?? []).slice(0, 3)]} />
    </button>
  );
}

function ExternalCard({ row, onOpen }: { row: KnowledgeRow; onOpen: () => void }) {
  const data = payloadOf(row);
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-2xl border border-slate-100 bg-white px-4 py-3.5 text-left">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-800">{row.title || '未命名资料'}</p>
        <span className="shrink-0 rounded-full bg-[#f3f6f7] px-2 py-0.5 text-[11px] text-slate-500">{text(data.sourceType)}</span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        {[text(data.source), text(data.evidenceLevel)].filter((item) => item !== '—').join(' · ') || '—'}
      </p>
      {data.content ? <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{String(data.content)}</p> : null}
      <Pills items={tagsOf(data)} />
    </button>
  );
}

function KnowledgeDetail({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const title = detail.kind === 'case'
    ? `${detail.row.tcmDisease || '未命名病'}${detail.row.tcmSyndrome ? ` · ${detail.row.tcmSyndrome}` : ''}`
    : (detail.row.title || '知识条目');
  return (
    <FormSheet open title={title} onClose={onClose}>
      {detail.kind === 'protocol' ? <ProtocolDetail row={detail.row} /> : null}
      {detail.kind === 'case' ? <CaseDetail row={detail.row} /> : null}
      {detail.kind === 'external' ? <ExternalDetail row={detail.row} /> : null}
    </FormSheet>
  );
}

function ProtocolDetail({ row }: { row: KnowledgeRow }) {
  const data = payloadOf(row);
  const count = Number(data.patientCount ?? 0);
  return (
    <div className="space-y-4">
      <Pair label="适用病症" value={text(data.tcmDisease)} />
      <Pair label="适用证型" value={text(data.tcmSyndrome)} />
      <Pair label="来源医案数量" value={`${count} 例`} />
      <Pair label="治疗次数" value={String(data.visitCount ?? '—')} />
      <Pair label="疗效观察" value={Number(data.effectiveRate) > 0 ? `有效 ${Math.round(Number(data.effectiveRate) * 100)}%` : '—'} />
      <Pills items={tagsOf(data)} />
      <p className="rounded-xl bg-[#f4fbf9] px-3 py-2 text-xs leading-5 text-slate-500">
        在已审核的 {count} 例相关医案中归纳。该结果仅代表本诊所历史病例，不构成通用临床结论。
      </p>
    </div>
  );
}

function CaseDetail({ row }: { row: CaseRecord }) {
  const plan = row.treatmentPlan ?? {};
  const contrast = (row.contrast ?? {}) as Record<string, unknown>;
  const delta = (contrast.delta ?? {}) as Record<string, unknown>;
  const verdict = pickField<string>(delta, 'verdict', 'verdict');
  const rate = pickNumber(delta, 'improvement_rate', 'improvementRate');
  return (
    <div className="space-y-4">
      <Pair label="适用病症" value={text(row.tcmDisease)} />
      <Pair label="适用证型" value={text(row.tcmSyndrome)} />
      <Pair label="主要表现" value={text(row.chiefComplaint)} />
      <Pair label="现病史" value={text(row.presentIllness)} />
      <Pair label="治则治法" value={text(plan.principle)} />
      <Pair label="穴位" value={(plan.acupoints ?? []).join('、') || '—'} />
      <Pair label="方药" value={(plan.prescriptions ?? []).join('、') || '—'} />
      <Pair label="调摄" value={(plan.lifestyle ?? []).join('、') || '—'} />
      <Pair label="疗效" value={[verdict, rate !== undefined ? `改善 ${Math.round(rate * 100)}%` : ''].filter(Boolean).join(' · ') || '—'} />
      <p className="rounded-xl bg-[#f4fbf9] px-3 py-2 text-xs leading-5 text-slate-500">
        来源：本院脱敏医案，治疗 {row.visitCount ?? 0} 次。已隐藏姓名、联系方式等身份信息，仅供内部检索与教学参考。
      </p>
    </div>
  );
}

function ExternalDetail({ row }: { row: KnowledgeRow }) {
  const data = payloadOf(row);
  return (
    <div className="space-y-4">
      <Pair label="资料类型" value={text(data.sourceType)} />
      <Pair label="资料来源" value={text(data.source)} />
      <Pair label="引用格式" value={text(data.citation)} />
      <Pair label="证据等级" value={text(data.evidenceLevel)} />
      <Pair label="适用病症" value={join(data.indications)} />
      <Pair label="适用证型" value={join(data.syndromes)} />
      <Pair label="治则治法" value={text(data.treatmentPrinciple)} />
      <Pair label="穴位" value={join(data.acupoints)} />
      <Pair label="方药" value={join(data.prescriptions)} />
      {data.content ? <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{String(data.content)}</p> : null}
      <p className="rounded-xl bg-[#f4fbf9] px-3 py-2 text-xs leading-5 text-slate-500">
        来源：外部治疗参考资料。AI 引用时须保留出处；无法确认页码时不得伪造。
      </p>
    </div>
  );
}

function ReferenceForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const empty = {
    title: '',
    sourceType: '专家经验',
    source: '',
    citation: '',
    tags: '',
    indications: '',
    syndromes: '',
    acupoints: '',
    prescriptions: '',
    treatmentPrinciple: '',
    evidenceLevel: '专家经验',
    content: '',
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const update = (key: keyof typeof empty, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    if (!form.title.trim()) return setError('请填写资料标题');
    if (!form.content.trim()) return setError('请填写原文内容');
    setSaving(true);
    setError(null);
    try {
      await api.syncExternalReference({
        title: form.title.trim(),
        sourceType: form.sourceType,
        source: form.source.trim() || undefined,
        citation: form.citation.trim() || undefined,
        tags: split(form.tags),
        indications: split(form.indications),
        syndromes: split(form.syndromes),
        acupoints: split(form.acupoints),
        prescriptions: split(form.prescriptions),
        treatmentPrinciple: form.treatmentPrinciple.trim() || undefined,
        evidenceLevel: form.evidenceLevel,
        content: form.content.trim(),
      });
      onSaved();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open
      title="录入外部参考"
      onClose={onClose}
      footer={(
        <div className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-slate-200" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : '保存'}</Button>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        <Field label="资料标题" required>
          <Input className={controlClass} value={form.title} onChange={(event) => update('title', event.target.value)} placeholder="例：眩晕·肝阳上亢取穴要点" />
        </Field>
        <div>
          <p className="mb-2 text-sm text-slate-700">资料类型</p>
          <div className="flex flex-wrap gap-2">
            {SOURCE_TYPES.map((item) => (
              <FilterPill key={item} label={item} active={form.sourceType === item} onClick={() => update('sourceType', item)} />
            ))}
          </div>
        </div>
        <Field label="资料来源">
          <Input className={controlClass} value={form.source} onChange={(event) => update('source', event.target.value)} placeholder="作者、出版机构、版本或出处" />
        </Field>
        <Field label="引用格式">
          <Input className={controlClass} value={form.citation} onChange={(event) => update('citation', event.target.value)} placeholder="书名、章节或 DOI，无法确认则留空" />
        </Field>
        <div>
          <p className="mb-2 text-sm text-slate-700">证据等级</p>
          <div className="flex flex-wrap gap-2">
            {EVIDENCE_LEVELS.map((item) => (
              <FilterPill key={item} label={item} active={form.evidenceLevel === item} onClick={() => update('evidenceLevel', item)} />
            ))}
          </div>
        </div>
        <Field label="病症标签">
          <Input className={controlClass} value={form.indications} onChange={(event) => update('indications', event.target.value)} placeholder="眩晕，不寐" />
        </Field>
        <Field label="证型标签">
          <Input className={controlClass} value={form.syndromes} onChange={(event) => update('syndromes', event.target.value)} placeholder="肝阳上亢" />
        </Field>
        <Field label="治则治法">
          <Input className={controlClass} value={form.treatmentPrinciple} onChange={(event) => update('treatmentPrinciple', event.target.value)} placeholder="平肝潜阳" />
        </Field>
        <Field label="穴位">
          <Input className={controlClass} value={form.acupoints} onChange={(event) => update('acupoints', event.target.value)} placeholder="曲池，太冲" />
        </Field>
        <Field label="方药">
          <Input className={controlClass} value={form.prescriptions} onChange={(event) => update('prescriptions', event.target.value)} placeholder="天麻钩藤饮" />
        </Field>
        <Field label="标签">
          <Input className={controlClass} value={form.tags} onChange={(event) => update('tags', event.target.value)} placeholder="高血压，教学" />
        </Field>
        <Field label="原文内容" required>
          <Textarea className={`${controlClass} min-h-[120px] resize-y`} value={form.content} onChange={(event) => update('content', event.target.value)} placeholder="原文摘录、加减要点、禁忌与注意事项" />
        </Field>
      </div>
    </FormSheet>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="flex items-center gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm leading-6 text-slate-600">
      <span className="text-slate-400">{label}</span>
      <span className="mt-0.5 block text-slate-800">{value || '—'}</span>
    </p>
  );
}

function Pills({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="rounded-full bg-[#f3f6f7] px-2 py-0.5 text-xs text-slate-600">{item}</span>
      ))}
    </div>
  );
}

function payloadOf(row: KnowledgeRow): Record<string, unknown> {
  return (row.payload ?? row) as Record<string, unknown>;
}

function tagsOf(data: Record<string, unknown>): string[] {
  return [
    ...toList(data.tags),
    ...toList(data.indications),
    ...toList(data.syndromes),
    ...toList(data.acupoints),
    ...toList(data.prescriptions),
  ].filter((item, index, all) => item && all.indexOf(item) === index).slice(0, 8);
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string') return split(value);
  return [];
}

function join(value: unknown): string {
  const items = toList(value);
  return items.length ? items.join('、') : '—';
}

function text(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  return String(value);
}

function split(value: string): string[] {
  return value.split(/[,，、/|]+/).map((item) => item.trim()).filter(Boolean);
}

function maskName(name?: string): string {
  const raw = (name ?? '').trim();
  if (!raw) return '某患者';
  return `${raw.slice(0, 1)}某`;
}

function patientOf(row: CaseRecord): { name?: string } | undefined {
  const snapshot = (row.archiveSnapshot ?? {}) as Record<string, unknown>;
  return row.patient ?? (snapshot.patient as { name?: string } | undefined);
}

function haystackOfCase(row: CaseRecord): string {
  const plan = row.treatmentPlan ?? {};
  return [
    row.tcmDisease,
    row.tcmSyndrome,
    row.chiefComplaint,
    row.presentIllness,
    plan.principle,
    ...(plan.acupoints ?? []),
    ...(plan.prescriptions ?? []),
  ].filter(Boolean).join(' ');
}
