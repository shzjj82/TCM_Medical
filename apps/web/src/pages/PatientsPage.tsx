import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Button } from '../components/ui/button';
import { FormSheet } from '../components/ui/form-sheet';
import { Input } from '../components/ui/input';
import { Scrollbar } from '../components/ui/scrollbar';
import { IntakeForm } from '../components/IntakeForm';
import { DuplicateSheet, PatientFilterButton, PatientFilterSidebar, PatientListFilters, PatientViewTabs } from '../components/PatientListFilters';
import { PatientBrief, toPatientBrief } from '../components/PatientBrief';
import { EmptyState } from '../components/ui/empty-state';
import { PatientBriefSkeleton, PatientListSkeleton } from '../components/ui/skeleton';
import { api, type PatientFacets } from '../lib/api';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, listHref, readListQuery, rememberList, type ListQuery } from '../lib/route';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import type { Patient } from '../types';

interface Props { onOpen: (key: string) => void; }

const DESKTOP_QUERY = '(min-width: 768px)';

const EMPTY_FACETS: PatientFacets = { diseases: [], syndromes: [], tags: [], doctors: [] };

export function PatientsPage({ onOpen }: Props) {
  const [query, setQuery] = useState<ListQuery>(() => readListQuery());
  const [keyword, setKeyword] = useState(() => readListQuery().q);
  const [rows, setRows] = useState<Patient[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [facets, setFacets] = useState<PatientFacets>(EMPTY_FACETS);
  const [desktop, setDesktop] = useState(() => window.matchMedia(DESKTOP_QUERY).matches);
  const listRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const page = query.page;

  const commitQuery = useCallback((next: ListQuery, mode: 'push' | 'replace') => {
    const href = listHref(next);
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== href) {
      window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', href);
    }
    rememberList(href);
    setQuery(next);
  }, []);

  const loadPage = useCallback(async (nextPage: number, append: boolean) => {
    const ticket = ++requestRef.current;
    if (append) setLoadingMore(true);
    else {
      setLoading(true);
      if (nextPage === 1) setRows([]);
    }
    setError(null);
    try {
      const result = await api.listPatients({
        keyword: query.q || undefined,
        page: nextPage,
        pageSize: query.pageSize || DEFAULT_PAGE_SIZE,
        disease: query.disease || undefined,
        syndrome: query.syndrome || undefined,
        course: query.course || undefined,
        tag: query.tag || undefined,
        doctor: query.doctor || undefined,
        visit: query.visit || undefined,
        view: query.view || undefined,
      });
      if (ticket !== requestRef.current) return;
      setTotal(result.total);
      setRows((current) => (append ? [...current, ...result.items] : result.items));
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setError(String(err));
    } finally {
      if (ticket === requestRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [query]);

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/') {
      window.history.replaceState(null, '', listHref(query));
    }
    rememberList(listHref(query));
    const onPop = () => {
      const next = readListQuery();
      setQuery(next);
      setKeyword(next.q);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [query]);

  useEffect(() => {
    if (keyword === query.q) return;
    const timer = window.setTimeout(() => commitQuery({ ...query, q: keyword, page: 1 }, 'replace'), 300);
    return () => window.clearTimeout(timer);
  }, [keyword, query, commitQuery]);

  useEffect(() => {
    api.patientFacets().then(setFacets).catch(() => setFacets(EMPTY_FACETS));
    api.patientDuplicates().then((groups) => setDuplicateCount(groups.length)).catch(() => setDuplicateCount(0));
  }, []);

  useEffect(() => {
    void loadPage(desktop ? query.page : 1, false);
  }, [loadPage, desktop, query.page]);

  useEffect(() => {
    if (desktop) return;
    const root = listRef.current;
    const target = sentinelRef.current;
    if (!root || !target || loading) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      if (loadingMoreRef.current || rows.length >= total) return;
      loadingMoreRef.current = true;
      void loadPage(page + 1, true).finally(() => {
        loadingMoreRef.current = false;
      });
    }, { root, rootMargin: '160px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [desktop, loading, loadPage, page, rows.length, total]);

  const view = rows.map(toPatientBrief);
  const pageSize = query.pageSize || DEFAULT_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const filtering = Boolean(query.q || query.view || query.disease || query.syndrome || query.course || query.tag || query.doctor || query.visit);

  function patchQuery(patch: Partial<ListQuery>) {
    commitQuery({ ...query, ...patch, page: 1 }, 'push');
  }

  return (
    <div className="flex h-full min-h-0">
      <PatientFilterSidebar
        open={filterOpen}
        query={query}
        facets={facets}
        duplicateCount={duplicateCount}
        onChange={patchQuery}
        onOpenDuplicates={() => setShowDuplicates(true)}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="hidden min-w-0 md:block">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">患者管理</h1>
          <p className="mt-1 hidden text-xs text-slate-400 2xl:block">从列表进入患者，查看疾病档案与全周期疗效</p>
        </div>
        <div className="flex w-full items-center gap-2 md:w-auto">
          <div className="relative min-w-0 flex-1 md:w-[240px] md:flex-none">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索姓名 / 编号 / 手机号"
              className="h-9 border-slate-200 bg-slate-50/80 pl-8"
            />
          </div>
          <Button variant="outline" size="icon" aria-label="刷新" title="刷新" onClick={() => void loadPage(desktop ? page : 1, false)} disabled={loading} className="hidden border-slate-200 md:inline-flex">
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          </Button>
          <PatientFilterButton query={query} pressed={filterOpen} onClick={() => setFilterOpen((open) => !open)} />
          <Button
            size="icon"
            className="shrink-0 rounded-lg md:hidden"
            aria-label="建档"
            onClick={() => setShowIntake(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <PatientListFilters query={query} facets={facets} onChange={patchQuery} />
          <Button className="hidden md:inline-flex" onClick={() => setShowIntake(true)}>
            <Plus className="h-4 w-4" />建档
          </Button>
        </div>
      </div>

      <PatientViewTabs query={query} onChange={patchQuery} />

      <FormSheet open={showIntake} title="初始录入 · 建立病患档案" onClose={() => setShowIntake(false)}>
        <IntakeForm
          onCreated={() => {
            setShowIntake(false);
            if (query.page !== 1) commitQuery({ ...query, page: 1 }, 'replace');
            else void loadPage(1, false);
            api.patientFacets().then(setFacets).catch(() => undefined);
          }}
        />
      </FormSheet>
      <DuplicateSheet
        open={showDuplicates}
        onClose={() => setShowDuplicates(false)}
        onMerged={() => {
          api.patientDuplicates().then((groups) => setDuplicateCount(groups.length)).catch(() => setDuplicateCount(0));
          void loadPage(desktop ? query.page : 1, false);
        }}
      />
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Scrollbar ref={listRef} className="min-h-0 flex-1" viewportClassName="flex min-h-full flex-col">
        {view.length === 0 ? (
          loading ? (
            <PatientListSkeleton />
          ) : (
            <EmptyState
              kind={filtering ? 'search' : 'empty'}
              text={filtering ? '没有符合当前筛选的患者' : '暂无患者，点击「建档」录入第一位'}
            />
          )
        ) : (
          <div className="flex flex-col gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-1">
            {view.map((row) => <PatientBrief key={row.key} data={row} onClick={() => onOpen(row.key)} />)}
            {desktop ? null : loadingMore ? (
              <>
                <PatientBriefSkeleton />
                <PatientBriefSkeleton />
              </>
            ) : (
              <div ref={sentinelRef} className="py-3 text-center text-xs text-slate-400">
                {rows.length >= total ? '没有更多了' : '上滑加载更多'}
              </div>
            )}
          </div>
        )}
      </Scrollbar>
      {desktop ? (
        <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-slate-500">
          <span>共 {total} 条</span>
          <div className="flex items-center gap-2">
            <span className="shrink-0">每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => commitQuery({ ...query, pageSize: Number(value), page: 1 }, 'push')}
            >
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
            <Button variant="outline" className="h-8 border-slate-200 px-2" disabled={page <= 1 || loading} onClick={() => commitQuery({ ...query, page: page - 1 }, 'push')}>
              上一页
            </Button>
            {Array.from({ length: pageCount }, (_, index) => index + 1).filter((item) => Math.abs(item - page) <= 2 || item === 1 || item === pageCount).map((item) => (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => commitQuery({ ...query, page: item }, 'push')}
                className={`h-8 min-w-8 rounded-md px-2 ${item === page ? 'bg-[#175055] text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {item}
              </button>
            ))}
            <Button variant="outline" className="h-8 border-slate-200 px-2" disabled={page >= pageCount || loading} onClick={() => commitQuery({ ...query, page: page + 1 }, 'push')}>
              下一页
            </Button>
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
