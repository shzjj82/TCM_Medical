import * as React from 'react';
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const Tabs = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { value: string; onValueChange: (v: string) => void; compact?: boolean }>(
  ({ className, value, onValueChange, compact, children, ...props }, ref) => {
    const items: Array<{ label: string; key: string }> = [];
    const others: React.ReactNode[] = [];
    // 约定：Tab 组件用 key/label 描述，这里先收集再渲染出头 + 内容
    React.Children.forEach(children as React.ReactNode, (child, index) => {
      if (React.isValidElement<TabItemProps>(child) && child.props.label) {
        items.push({ label: child.props.label, key: child.props.value });
        if (child.props.value === value) others.push(child);
      } else {
        others.push(<div key={`extra-${index}`}>{child}</div>);
      }
    });
    return (
      <div ref={ref} className={cn('w-full', className)} {...props}>
        <div className="inline-flex h-9 items-center gap-1 rounded-md bg-secondary p-1">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => onValueChange(item.key)}
              className={cn(
                'inline-flex items-center justify-center whitespace-nowrap rounded px-3 py-1 text-sm font-medium transition-colors',
                item.key === value ? 'bg-card shadow text-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {compact ? null : <div className="mt-4">{others}</div>}
      </div>
    );
  },
);
Tabs.displayName = 'Tabs';

export interface TabItemProps extends HTMLAttributes<HTMLDivElement> {
  value: string;
  label?: string;
}

export function TabItem({ className, children, ...props }: TabItemProps) {
  void props;
  return <div className={cn('animate-fade-in', className)}>{children}</div>;
}

export const Separator = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('h-px w-full bg-border', className)} {...props} />
  ),
);
Separator.displayName = 'Separator';
