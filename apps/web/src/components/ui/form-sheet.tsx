import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { RefreshCw, SlidersHorizontal, X } from 'lucide-react';
import { Button } from './button';
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
  /** 宽屏旁侧展开；窄屏另开一层弹出框。 */
  side?: ReactNode;
  sideTitle?: string;
  /** 折叠侧栏 / 关闭移动端对比弹层，不是关闭整张表单。 */
  onSideCollapse?: () => void;
  /** 侧栏标题旁的刷新。 */
  onSideRefresh?: () => void;
  sideRefreshing?: boolean;
  sideRefreshDisabled?: boolean;
}

function SideChrome({
  titleId,
  title,
  onCollapse,
  onRefresh,
  refreshing,
  refreshDisabled,
  children,
  className,
  handle = false,
}: {
  titleId: string;
  title: string;
  onCollapse?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshDisabled?: boolean;
  children: ReactNode;
  className?: string;
  handle?: boolean;
}) {
  return (
    <aside aria-labelledby={titleId} className={className}>
      {handle ? <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-slate-200" /> : null}
      <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-1 pt-3 md:px-5 md:pt-3">
        <h2 id={titleId} className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="flex items-center gap-2">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="刷新对比"
              title="刷新对比"
              disabled={refreshDisabled || refreshing}
              onClick={onRefresh}
              className="h-8 w-8 border-slate-200 bg-white text-slate-700 hover:bg-white"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          ) : null}
          {onCollapse ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="折叠对比"
              title="折叠对比"
              onClick={onCollapse}
              className="h-8 w-8 border-slate-200 bg-white text-slate-700 hover:bg-white"
            >
              <SlidersHorizontal className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      <Scrollbar className="min-h-0 flex-1" viewportClassName="flex h-full min-h-full flex-col px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:px-5 md:pb-5">
        {children}
      </Scrollbar>
    </aside>
  );
}

/** 窄屏从底部拉起，宽屏居中弹窗；可选旁侧展开栏。 */
export function FormSheet({
  open,
  title,
  onClose,
  children,
  footer,
  layer = 'base',
  fill = false,
  side,
  sideTitle = '对比',
  onSideCollapse,
  onSideRefresh,
  sideRefreshing = false,
  sideRefreshDisabled = false,
}: Props) {
  const titleId = useId();
  const sideTitleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const hasSide = Boolean(side);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return;
      if (layer !== 'assist' && document.querySelector('[data-assist-dialog]')) return;
      if (hasSide && onSideCollapse) {
        onSideCollapse();
        return;
      }
      onClose();
    };
    document.addEventListener('keydown', onKey);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose, layer, hasSide, onSideCollapse]);

  if (!open) return null;

  const zRoot = layer === 'assist' ? 'z-[70]' : 'z-50';

  return createPortal(
    <>
      <div className={`fixed inset-0 flex items-end justify-center md:items-center md:p-6 ${zRoot}`}>
        <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="关闭" onClick={onClose} />
        <div
          className={`relative flex w-full flex-col overflow-hidden md:max-h-[min(760px,86vh)] ${
            hasSide
              ? 'max-h-[88vh] md:w-[min(1120px,calc(100vw-3rem))] md:flex-row md:items-stretch'
              : 'max-h-[88vh] md:w-[720px]'
          }`}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-assist-dialog={layer === 'assist' ? '' : undefined}
            className={`form-sheet-panel relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-xl outline-none rounded-t-[22px] ${
              hasSide
                ? 'md:w-[560px] md:shrink-0 md:rounded-l-[22px] md:rounded-r-none'
                : 'md:rounded-[22px]'
            } ${fill ? 'h-[88vh] md:h-[min(760px,86vh)]' : ''}`}
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
            {fill ? (
              <Scrollbar className="min-h-0 flex-1" viewportClassName="flex flex-col px-4 md:px-5 pb-4">
                {children}
              </Scrollbar>
            ) : (
              <div className={`min-h-0 flex-auto overflow-y-auto px-4 md:px-5 ${footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-5'}`}>
                {children}
              </div>
            )}
            {footer ? (
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:px-5 md:pb-4">
                {footer}
              </div>
            ) : null}
          </div>

          {hasSide ? (
            <SideChrome
              titleId={sideTitleId}
              title={sideTitle}
              onCollapse={onSideCollapse}
              onRefresh={onSideRefresh}
              refreshing={sideRefreshing}
              refreshDisabled={sideRefreshDisabled}
              className="filter-aside-in relative hidden min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-l border-slate-100 bg-[#f7faf9] shadow-xl md:flex md:rounded-r-[22px]"
            >
              {side}
            </SideChrome>
          ) : null}
        </div>
      </div>

      {hasSide ? (
        <div className={`fixed inset-0 flex items-end justify-center md:hidden ${layer === 'assist' ? 'z-[80]' : 'z-[60]'}`}>
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="关闭对比"
            onClick={onSideCollapse ?? onClose}
          />
          <SideChrome
            titleId={`${sideTitleId}-mobile`}
            title={sideTitle}
            onCollapse={onSideCollapse}
            onRefresh={onSideRefresh}
            refreshing={sideRefreshing}
            refreshDisabled={sideRefreshDisabled}
            handle
            className="form-sheet-panel relative flex max-h-[92vh] min-h-0 w-full flex-col overflow-hidden rounded-t-[22px] bg-[#f7faf9] shadow-xl"
          >
            {side}
          </SideChrome>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
