import { Children, isValidElement, useState, type ChangeEvent, type ReactNode } from 'react';
import { CalendarIcon } from 'lucide-react';
import type { DropdownProps } from 'react-day-picker';
import { cn } from '../../lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];

function keepPopoverOpen(event: { target: EventTarget | null; preventDefault: () => void }) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-radix-select-content]') || target.closest('[role="listbox"]')) {
    event.preventDefault();
  }
}

/** 年月用和表单相同的 Select，月份显示为「1月」。 */
function CalendarDropdown({ name, value, onChange, children, 'aria-label': ariaLabel }: DropdownProps) {
  const options = Children.toArray(children).flatMap((child) => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child)) return [];
    const optionValue = child.props.value;
    if (optionValue === undefined || optionValue === null) return [];
    const monthLabel = MONTHS[Number(optionValue)];
    const label = name === 'months' && monthLabel ? monthLabel : String(child.props.children ?? optionValue);
    return [{ value: String(optionValue), label }];
  });
  return (
    <Select
      value={value === undefined || value === null ? undefined : String(value)}
      onValueChange={(next) => onChange?.({ target: { value: next } } as ChangeEvent<HTMLSelectElement>)}
    >
      <SelectTrigger
        aria-label={name === 'months' ? '月份' : name === 'years' ? '年份' : ariaLabel}
        className={cn('h-8 px-2 text-xs', name === 'years' ? 'w-[5.25rem]' : 'w-[4.75rem]')}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent className="z-[80] max-h-60">
        {options.map((item) => (
          <SelectItem key={item.value} value={item.value} className="py-1 text-xs">{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function parseIso(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return undefined;
  return date;
}

function toIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatZh(date: Date): string {
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** shadcn 日期选择：Button + Popover + Calendar。 */
export function DatePicker({
  value,
  onChange,
  placeholder = '年 / 月 / 日',
  suffix,
  future = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  /** 允许选择今天之后的日期，用于随访安排。 */
  future?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  const thisYear = new Date().getFullYear();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-9 w-full justify-start rounded-lg border-slate-200 bg-white px-3 text-sm font-normal shadow-none hover:bg-white',
            !selected && 'text-muted-foreground',
          )}
        >
          <CalendarIcon className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{selected ? formatZh(selected) : placeholder}</span>
          {suffix ? <span className="ml-auto shrink-0 text-slate-500">{suffix}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-auto p-0"
        onPointerDownOutside={keepPopoverOpen}
        onFocusOutside={keepPopoverOpen}
        onInteractOutside={keepPopoverOpen}
      >
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? (future ? new Date() : new Date(thisYear - 30, 0))}
          onSelect={(date) => {
            if (!date) return;
            onChange(toIso(date));
            setOpen(false);
          }}
          disabled={future ? undefined : { after: new Date() }}
          fromYear={future ? thisYear - 1 : 1900}
          toYear={future ? thisYear + 5 : thisYear}
          captionLayout="dropdown-buttons"
          weekStartsOn={1}
          components={{ Dropdown: CalendarDropdown }}
          classNames={{ caption_dropdowns: 'flex items-center gap-1' }}
          formatters={{
            formatMonthCaption: (date) => MONTHS[date.getMonth()] ?? '',
            formatWeekdayName: (date) => ['日', '一', '二', '三', '四', '五', '六'][date.getDay()] ?? '',
          }}
          labels={{
            labelMonthDropdown: () => '月份',
            labelYearDropdown: () => '年份',
          }}
        />
        {value ? (
          <div className="border-t border-slate-100 px-2 py-1.5 text-right">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-slate-500"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              清除日期
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
