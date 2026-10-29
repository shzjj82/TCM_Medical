import { useEffect, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { DuplicateGroup, PatientFacets } from '../lib/api';
import { api } from '../lib/api';
import type { ListQuery } from '../lib/route';
import { Button } from './ui/button';
import { Scrollbar } from './ui/scrollbar';
import { FormSheet } from './ui/form-sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const VIEWS: Array<{ id: string; label: string }> = [
  { id: '', label: '全部' },
  { id: 'recent', label: '最近就诊' },
  { id: 'followup', label: '待随访' },
  { id: 'overdue', label: '长期未复诊' },
  { id: 'treating', label: '治疗中' },
  { id: 'closed', label: '已结案' },
];

const COURSES = ['治疗中', '已结案', '暂停', '待建档'];
const VISITS: Array<{ id: string; label: string }> = [
  { id: 'd7', label: '近 7 天' },
  { id: 'd30', label: '近 30 天' },
  { id: 'd90', label: '近 90 天' },
  { id: 'over30', label: '超过 30 天' },
  { id: 'over90', label: '超过 90 天' },
];

interface Props {
  query: ListQuery;
  facets: PatientFacets;
  onChange: (patch: Partial<ListQuery>) => void;
  onOpenDuplicates: () => void;
  duplicateCount: number;
}

function isFiltering(query: ListQuery) {
  return Boolean(query.disease || query.syndrome || query.course || query.tag || query.doctor || query.visit);
}

export function PatientViewTabs({ query, onChange }: { query: ListQuery; onChange: (patch: Partial<ListQuery>) => void }) {
  const active = query.view || '';
  return (
    <Scrollbar className="shrink-0" viewportClassName="flex gap-2">
      {VIEWS.map((item) => {
        const selected = item.id === active;
        return (
          <button
            key={item.label}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange({ view: item.id })}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors ${
              selected ? 'bg-[#175055] text-white' : 'bg-[#f3f6f7] text-slate-600 hover:bg-[#e7eef1]'
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </Scrollbar>
  );
}

export function PatientFilterButton({ query, pressed, onClick }: { query: ListQuery; pressed: boolean; onClick: () => void }) {
  const filtering = isFiltering(query);
  return (
    <Button
      variant="outline"
      size="icon"
      aria-label="筛选"
      title="筛选"
      aria-pressed={pressed}
      onClick={onClick}
      className="relative hidden border-slate-200 md:inline-flex"
    >
      <SlidersHorizontal className="h-4 w-4" />
      {filtering ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#175055]" /> : null}
    </Button>
  );
}

export function PatientFilterSidebar({ open, query, facets, onChange, onOpenDuplicates, duplicateCount }: Props & { open: boolean }) {
  const filtering = isFiltering(query);
  return (
    <aside aria-hidden={!open} className={`hidden h-full shrink-0 overflow-hidden transition-[width,margin] duration-200 ease-out md:block ${open ? 'mr-5 w-[220px]' : 'mr-0 w-0'}`}>
      {open ? (
      <div className="filter-aside-in flex h-full w-[220px] flex-col gap-4 border-r border-slate-100 pr-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">筛选</p>
          {filtering ? (
            <button type="button" className="text-xs text-slate-400 hover:text-[#175055]" onClick={() => onChange({ disease: '', syndrome: '', course: '', tag: '', doctor: '', visit: '' })}>
              清除
            </button>
          ) : null}
        </div>
        <Scrollbar className="min-h-0 flex-1" viewportClassName="flex flex-col gap-4">
          <FilterFields query={query} facets={facets} onChange={onChange} />
        </Scrollbar>
        <Button variant="outline" className="w-full shrink-0 border-slate-200" onClick={onOpenDuplicates}>
          重复档案{duplicateCount ? ` ${duplicateCount}` : ''}
        </Button>
      </div>
      ) : null}
    </aside>
  );
}

export function PatientListFilters({ query, facets, onChange }: Pick<Props, 'query' | 'facets' | 'onChange'>) {
  const [sheet, setSheet] = useState(false);
  const filtering = isFiltering(query);
  return (
    <>
      <Button
        variant="outline"
        size="icon"
        aria-label={filtering ? '筛选，已选' : '筛选'}
        title="筛选"
        aria-pressed={filtering}
        className="relative shrink-0 rounded-lg border-slate-200 bg-white md:hidden"
        onClick={() => setSheet(true)}
      >
        <SlidersHorizontal className="h-4 w-4" />
        {filtering ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#175055]" /> : null}
      </Button>
      <FormSheet open={sheet} title="筛选患者" onClose={() => setSheet(false)}>
        <div className="flex flex-col gap-4">
          <FilterFields query={query} facets={facets} onChange={onChange} />
          {filtering ? (
            <Button variant="outline" onClick={() => onChange({ disease: '', syndrome: '', course: '', tag: '', doctor: '', visit: '' })}>
              清除筛选
            </Button>
          ) : null}
        </div>
      </FormSheet>
    </>
  );
}

function FilterFields({ query, facets, onChange }: { query: ListQuery; facets: PatientFacets; onChange: (patch: Partial<ListQuery>) => void }) {
  return (
    <>
      <FilterSelect label="疾病" value={query.disease} options={facets.diseases} onChange={(disease) => onChange({ disease })} />
      <FilterSelect label="证型" value={query.syndrome} options={facets.syndromes} onChange={(syndrome) => onChange({ syndrome })} />
      <FilterSelect label="疗程状态" value={query.course} options={COURSES} onChange={(course) => onChange({ course })} />
      <FilterSelect label="最后就诊" value={query.visit} options={VISITS.map((item) => item.label)} values={VISITS.map((item) => item.id)} onChange={(visit) => onChange({ visit })} />
      <FilterSelect label="标签" value={query.tag} options={facets.tags} onChange={(tag) => onChange({ tag })} />
      <FilterSelect label="主治医生" value={query.doctor} options={facets.doctors} empty="暂无医生" onChange={(doctor) => onChange({ doctor })} />
    </>
  );
}

function FilterSelect({
  label, value, options, values, empty, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  values?: string[];
  empty?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-slate-400">{label}</span>
      <Select value={value || '__all__'} onValueChange={(next) => onChange(next === '__all__' ? '' : next)}>
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={`全部${label}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">全部{label}</SelectItem>
          {options.length === 0 && empty ? <SelectItem value="__empty__" disabled>{empty}</SelectItem> : null}
          {options.map((option, index) => (
            <SelectItem key={option} value={values?.[index] ?? option}>{option}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DuplicateSheet({
  open,
  onClose,
  onMerged,
}: {
  open: boolean;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [groups, setGroups] = useState<DuplicateGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primary, setPrimary] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    api.patientDuplicates()
      .then((rows) => {
        setGroups(rows);
        setPrimary(Object.fromEntries(rows.map((group, index) => [index, group.patients[0]?.id ?? ''])));
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, [open]);

  async function merge(index: number) {
    const group = groups[index];
    const keep = primary[index] || group.patients[0]?.id;
    if (!keep) return;
    setSaving(true);
    setError(null);
    try {
      for (const patient of group.patients) {
        if (patient.id !== keep) await api.mergePatients(keep, patient.id);
      }
      onMerged();
      const rows = await api.patientDuplicates();
      setGroups(rows);
      setPrimary(Object.fromEntries(rows.map((item, itemIndex) => [itemIndex, item.patients[0]?.id ?? ''])));
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet open={open} title="重复档案" onClose={onClose}>
      {loading ? <p className="text-sm text-slate-400">加载中…</p> : null}
      {error ? <p className="text-sm text-rose-600">{error}</p> : null}
      {!loading && groups.length === 0 ? (
        <p className="text-sm text-slate-500">未发现重复档案。手机号相同，或姓名相同且都没有手机号时，会列在这里。</p>
      ) : null}
      <div className="flex flex-col gap-4">
        {groups.map((group, index) => (
          <div key={`${group.reason}-${group.patients.map((item) => item.id).join('-')}`} className="rounded-2xl border border-slate-100 p-3">
            <p className="text-xs text-slate-400">{group.reason}</p>
            <div className="mt-2 flex flex-col gap-2">
              {group.patients.map((patient) => (
                <label key={patient.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="radio"
                    name={`dup-${index}`}
                    checked={(primary[index] || group.patients[0]?.id) === patient.id}
                    onChange={() => setPrimary((current) => ({ ...current, [index]: patient.id }))}
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {patient.name}
                    {patient.gender ? ` ${patient.gender}` : ''}
                    {patient.age ? ` ${patient.age}岁` : ''}
                    {patient.phone ? ` · ${patient.phone}` : ''}
                  </span>
                </label>
              ))}
            </div>
            <Button className="mt-3" disabled={saving} onClick={() => void merge(index)}>合并到所选档案</Button>
          </div>
        ))}
      </div>
    </FormSheet>
  );
}
