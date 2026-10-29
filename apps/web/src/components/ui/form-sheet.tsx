import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Scrollbar } from './scrollbar';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 固定在底部，不随内容滚动。 */
  footer?: ReactNode;
  /** 叠在另一张表单之上，例如智能填写。 */
  layer?: 'base' | 'assist';
  /** 高度固定，内容在内部滚动，不随页签变高变矮。 */
  fill?: boolean;
}

/** 窄屏从底部拉起，宽屏居中弹窗。 */
export function FormSheet({ open, title, onClose, children, footer, layer = 'base', fill = false }: Props) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      if (layer !== 'assist' && document.querySelector('[data-assist-dialog]')) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, layer]);

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 flex items-end justify-center md:items-center md:p-6 ${layer === 'assist' ? 'z-[70]' : 'z-50'}`}>
      <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="关闭" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-assist-dialog={layer === 'assist' ? '' : undefined}
        className={`form-sheet-panel relative flex w-full flex-col overflow-hidden rounded-t-[22px] bg-white shadow-xl outline-none md:w-[720px] md:rounded-[22px] ${fill ? 'h-[88vh] md:h-[min(760px,86vh)]' : 'max-h-[88vh] md:max-h-[min(760px,86vh)]'}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200 md:hidden" />
        <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-3 md:px-5 md:pt-3">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Scrollbar className="min-h-0 flex-1" viewportClassName={`${fill ? 'flex flex-col' : ''} px-4 md:px-5 ${footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-5'}`}>
          {children}
        </Scrollbar>
        {footer ? (
          <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-5 md:pb-4">
            {footer}
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
