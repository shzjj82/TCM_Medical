import { forwardRef, type HTMLAttributes } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

type Tone = 'info' | 'warn' | 'danger' | 'success';

const TONES: Record<Tone, { cls: string; icon: typeof Info }> = {
  info: { cls: 'border-sky-200 bg-sky-50 text-sky-900', icon: Info },
  warn: { cls: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  danger: { cls: 'border-red-200 bg-red-50 text-red-800', icon: AlertTriangle },
  success: { cls: 'border-emerald-200 bg-emerald-50 text-emerald-900', icon: CheckCircle2 },
};

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
  title?: string;
}

export const Alert = forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = 'info', title, children, ...props }, ref) => {
    const { cls, icon: Icon } = TONES[tone];
    return (
      <div ref={ref} className={cn('flex gap-2 rounded-md border p-3 text-sm', cls, className)} {...props}>
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          {title ? <p className="font-semibold">{title}</p> : null}
          <div className="text-sm/relaxed opacity-90">{children}</div>
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';
