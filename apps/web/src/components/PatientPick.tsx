import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';
import type { Patient } from '../types';
import { Input } from './ui/input';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

export function patientLabel(patient: Patient): string {
  return `${patient.name}${patient.gender ? ` ${patient.gender}` : ''}${patient.age ? ` ${patient.age}岁` : ''}`;
}

export function patientKeyOf(patient: Patient): string {
  return patient.externalId ?? patient.id;
}

function extraOf(patient: Patient): string {
  return [patient.gender, patient.age ? `${patient.age}岁` : '', patient.externalId].filter(Boolean).join(' ');
}

/** 搜索并指定一位患者，对话和建议页共用。点开即出下拉，可按姓名/编号筛选。 */
export function PatientPick({
  value,
  onChange,
  placeholder = '搜索患者姓名 / 编号',
}: {
  value: Patient | null;
  onChange: (next: Patient | null) => void;
  placeholder?: string;
}) {
  const listId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [menu, setMenu] = useState<{ top: number; left: number; width: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (boxRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest?.('[data-patient-pick-list]')) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  function place() {
    const node = boxRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    setMenu({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }

  useEffect(() => {
    if (!open) {
      setMenu(null);
      return;
    }
    place();
    const sync = () => place();
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api.listPatients({ keyword: keyword.trim() || undefined, page: 1, pageSize: 8 })
        .then((result) => {
          if (cancelled) return;
          setRows(result.items);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setRows([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, keyword.trim() ? 200 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [keyword, open]);

  function choose(item: Patient) {
    onChange(item);
    setKeyword('');
    setOpen(false);
  }

  function openList() {
    setKeyword('');
    setOpen(true);
  }

  return (
    <div ref={boxRef} className="relative">
      <Input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        className={cn(controlClass, 'bg-white pr-16', open && 'border-[#175055]')}
        value={open ? keyword : (value ? patientLabel(value) : '')}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => {
          setKeyword(event.target.value);
          setOpen(true);
        }}
        onFocus={openList}
        onClick={openList}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, Math.max(rows.length - 1, 0)));
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === 'Enter' && open && rows[active]) {
            event.preventDefault();
            choose(rows[active]);
          } else if (event.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {value && !open ? (
        <button
          type="button"
          className="absolute right-8 top-2 text-xs text-[#175055]"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(null)}
        >
          清除
        </button>
      ) : null}
      <ChevronDown className={`pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      {open && menu
        ? createPortal(
          <ul
            id={listId}
            role="listbox"
            data-patient-pick-list
            style={{ top: menu.top, left: menu.left, width: menu.width }}
            className="scrollbar-thin fixed z-[80] max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-md"
          >
            {loading ? (
              <li className="px-2 py-1.5 text-sm text-slate-400">正在搜索…</li>
            ) : rows.length === 0 ? (
              <li className="px-2 py-1.5 text-sm text-slate-400">没有匹配患者</li>
            ) : rows.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  className={cn(
                    'block w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700',
                    index === active && 'bg-[#f4fbf9]',
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                >
                  {item.name}
                  <span className="ml-2 text-xs text-slate-400">{extraOf(item)}</span>
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
        : null}
    </div>
  );
}
