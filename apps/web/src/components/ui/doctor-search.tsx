import { useEffect, useId, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { cn } from '../../lib/utils';
import { Input } from './input';

/** 姓名包含关键字，或关键字按顺序出现在姓名里。分数越小越靠前。 */
export function rankDoctor(name: string, query: string): number | null {
  const text = name.trim().toLowerCase();
  const keyword = query.trim().toLowerCase();
  if (!text) return null;
  if (!keyword) return 3;
  if (text === keyword) return 0;
  if (text.startsWith(keyword)) return 1;
  if (text.includes(keyword)) return 2;
  let index = 0;
  for (const char of text) {
    if (char === keyword[index]) index += 1;
    if (index === keyword.length) return 4;
  }
  return null;
}

export function DoctorSearch({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [doctors, setDoctors] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api.patientFacets()
      .then((facets) => { if (!cancelled) setDoctors(facets.doctors); })
      .catch(() => { if (!cancelled) setDoctors([]); });
    return () => { cancelled = true; };
  }, []);

  const matches = useMemo(() => {
    return doctors
      .map((name) => ({ name, rank: rankDoctor(name, value) }))
      .filter((item): item is { name: string; rank: number } => item.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, 'zh'))
      .slice(0, 8)
      .map((item) => item.name);
  }, [doctors, value]);

  const typed = value.trim();
  const exact = doctors.some((name) => name === typed);
  const canUseTyped = Boolean(typed) && !exact;
  const options = canUseTyped ? [...matches, typed] : matches;

  function choose(name: string) {
    onChange(name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={cn(className, open && 'border-[#175055]')}
        value={value}
        placeholder="搜索医生姓名"
        autoComplete="off"
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => { setActive(0); setOpen(true); }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(options.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && options[active]) {
            event.preventDefault();
            choose(options[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open ? (
        <ul id={listId} role="listbox" className="scrollbar-thin absolute z-[80] mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md">
          {matches.map((name, index) => (
            <li key={name} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={cn('flex w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700', index === active && 'bg-slate-100')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(name)}
              >
                {name}
              </button>
            </li>
          ))}
          {canUseTyped ? (
            <li role="option" aria-selected={active === matches.length}>
              <button
                type="button"
                className={cn('flex w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-500', active === matches.length && 'bg-slate-100')}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(matches.length)}
                onClick={() => choose(typed)}
              >
                使用「{typed}」
              </button>
            </li>
          ) : null}
          {!matches.length && !canUseTyped ? (
            <li className="px-2 py-1.5 text-sm text-slate-400">暂无医生，输入姓名即可填写</li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
