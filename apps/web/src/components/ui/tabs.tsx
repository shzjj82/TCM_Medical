import * as React from 'react';
import { forwardRef, useLayoutEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

/** 底部横线跟着当前页签滑动。barRef 挂在相对定位的页签栏上。 */
export function useTabUnderline(active: string, color: string) {
  const barRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    const button = bar?.querySelector<HTMLElement>(`[data-tab="${active}"]`);
    if (!bar || !button) return;
    const place = () => {
      const left = button.offsetLeft;
      const width = button.offsetWidth;
      setBox((prev) => (prev && prev.left === left && prev.width === width ? prev : { left, width }));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    bar.addEventListener('scroll', place, { passive: true });
    return () => {
      observer.disconnect();
      bar.removeEventListener('scroll', place);
    };
  }, [active]);

  const indicator = box ? (
    <span
      aria-hidden
      className="pointer-events-none absolute bottom-0 z-10 h-0.5 transition-[left,width] duration-200 ease-out"
      style={{ left: box.left, width: box.width, backgroundColor: color }}
    />
  ) : null;

  return { barRef, indicator };
}

export const Tabs = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { value: string; onValueChange: (v: string) => void; compact?: boolean; fill?: boolean; variant?: 'pill' | 'line'; stableHeight?: boolean; end?: ReactNode; stretch?: boolean }>(
  ({ className, value, onValueChange, compact, fill, variant = 'pill', stableHeight, end, stretch, children, ...props }, ref) => {
    const { barRef, indicator } = useTabUnderline(value, '#175055');
    const items: Array<{ label: string; key: string }> = [];
    const panels: React.ReactElement<TabItemProps>[] = [];
    const others: React.ReactNode[] = [];
    // 约定：Tab 组件用 key/label 描述，这里先收集再渲染出头 + 内容
    React.Children.forEach(children as React.ReactNode, (child, index) => {
      if (React.isValidElement<TabItemProps>(child) && child.props.label) {
        items.push({ label: child.props.label, key: child.props.value });
        panels.push(child);
        if (child.props.value === value) others.push(child);
      } else {
        others.push(<div key={`extra-${index}`}>{child}</div>);
      }
    });
    return (
      <div ref={ref} className={cn('w-full', stretch && 'flex min-h-full flex-1 flex-col', className)} {...props}>
        <div className={cn(variant === 'line' && 'flex items-end gap-4 border-b border-slate-100')}>
        <div
          ref={variant === 'line' ? barRef : undefined}
          className={cn(
            variant === 'line'
              ? 'scrollbar-none relative flex min-w-0 flex-1 gap-6 overflow-x-auto'
              : 'inline-flex h-9 items-center gap-1 rounded-md bg-secondary p-1',
            variant !== 'line' && fill && 'flex w-full',
          )}
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              data-tab={item.key}
              onClick={() => onValueChange(item.key)}
              className={cn(
                variant === 'line'
                  ? 'shrink-0 pb-2 text-sm transition-colors duration-200'
                  : 'inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1 text-sm font-medium transition-colors',
                variant !== 'line' && fill && 'min-w-0 flex-1 px-1.5 text-xs sm:text-sm',
                item.key === value
                  ? (variant === 'line' ? 'text-[#175055]' : 'bg-card shadow text-foreground')
                  : (variant === 'line' ? 'text-slate-500' : 'text-muted-foreground hover:text-foreground'),
              )}
            >
              {variant === 'line' ? (
                <span className="grid">
                  <span className={item.key === value ? 'col-start-1 row-start-1 font-medium' : 'col-start-1 row-start-1'}>{item.label}</span>
                  <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">{item.label}</span>
                </span>
              ) : item.label}
            </button>
          ))}
          {variant === 'line' ? indicator : null}
        </div>
        {variant === 'line' && end ? <div className="mb-1.5 shrink-0">{end}</div> : null}
        </div>
        {compact ? null : stableHeight ? (
          <div className="mt-4 grid">
            {panels.map((panel) => {
              const active = panel.props.value === value;
              const fill = Boolean(panel.props.fill);
              return (
                <div
                  key={panel.props.value}
                  className={cn('col-start-1 row-start-1', fill && 'flex h-full min-h-0 flex-col', active ? '' : 'invisible')}
                  aria-hidden={active ? undefined : true}
                >
                  {panel}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4">{others}</div>
        )}
      </div>
    );
  },
);
Tabs.displayName = 'Tabs';

export interface TabItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  label?: string;
  /** 叠在一起时撑满三个页签里最高的那一页。 */
  fill?: boolean;
}

export function TabItem({ className, children, fill, ...props }: TabItemProps) {
  void props;
  return <div className={cn(fill ? 'flex h-full min-h-0 flex-col' : 'animate-fade-in', className)}>{children}</div>;
}

export const Separator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('h-px w-full bg-border', className)} {...props} />
  ),
);
Separator.displayName = 'Separator';
