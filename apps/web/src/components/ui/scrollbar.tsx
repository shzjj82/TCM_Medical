import { forwardRef, useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface Bar {
  size: number;
  move: number;
  show: boolean;
}

const HIDDEN: Bar = { size: 0, move: 0, show: false };

/** 滑块高度按可视比例，位移按已滚动比例。轨道比内容区各边内缩 2px。 */
function measure(viewport: number, scroll: number, offset: number): Bar {
  const track = Math.max(viewport - 4, 0);
  if (scroll <= viewport + 1 || track <= 0) return HIDDEN;
  const size = Math.max((viewport / scroll) * track, 20);
  const room = track - size;
  const move = room <= 0 ? 0 : (offset / (scroll - viewport)) * room;
  return { size, move, show: true };
}

/**
 * 对齐 Element Plus el-scrollbar：藏起原生滚动条，悬停时在边缘淡入 6px 圆角滑块。
 * ref 指向真正滚动的那一层，方便做滚动监听。
 */
export const Scrollbar = forwardRef<HTMLDivElement, {
  className?: string;
  viewportClassName?: string;
  children: ReactNode;
}>(function Scrollbar({ className, viewportClassName, children }, ref) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const metrics = useRef({ vertical: 20, horizontal: 20 });
  const drag = useRef<{ axis: 'y' | 'x'; start: number; scroll: number } | null>(null);
  const [vertical, setVertical] = useState<Bar>(HIDDEN);
  const [horizontal, setHorizontal] = useState<Bar>(HIDDEN);
  const [active, setActive] = useState(false);

  const update = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const nextVertical = measure(el.clientHeight, el.scrollHeight, el.scrollTop);
    const nextHorizontal = measure(el.clientWidth, el.scrollWidth, el.scrollLeft);
    metrics.current.vertical = nextVertical.size;
    metrics.current.horizontal = nextHorizontal.size;
    setVertical(nextVertical);
    setHorizontal(nextHorizontal);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    el.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', update);
    };
  }, [update, children]);

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const current = drag.current;
      const el = viewportRef.current;
      if (!current || !el) return;
      if (current.axis === 'y') {
        const track = Math.max(el.clientHeight - 4, 1);
        const thumb = metrics.current.vertical;
        const max = el.scrollHeight - el.clientHeight;
        el.scrollTop = current.scroll + ((event.clientY - current.start) / Math.max(track - thumb, 1)) * max;
      } else {
        const track = Math.max(el.clientWidth - 4, 1);
        const thumb = metrics.current.horizontal;
        const max = el.scrollWidth - el.clientWidth;
        el.scrollLeft = current.scroll + ((event.clientX - current.start) / Math.max(track - thumb, 1)) * max;
      }
    };
    const onUp = () => {
      drag.current = null;
      setActive(rootRef.current?.matches(':hover') ?? false);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  function setRefs(node: HTMLDivElement | null) {
    viewportRef.current = node;
    if (typeof ref === 'function') ref(node);
    else if (ref) ref.current = node;
  }

  function startDrag(axis: 'y' | 'x', event: ReactPointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const el = viewportRef.current;
    if (!el) return;
    drag.current = {
      axis,
      start: axis === 'y' ? event.clientY : event.clientX,
      scroll: axis === 'y' ? el.scrollTop : el.scrollLeft,
    };
    setActive(true);
  }

  function jump(axis: 'y' | 'x', event: ReactMouseEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const el = viewportRef.current;
    if (!el) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (axis === 'y') el.scrollTop = ((event.clientY - rect.top) / rect.height) * (el.scrollHeight - el.clientHeight);
    else el.scrollLeft = ((event.clientX - rect.left) / rect.width) * (el.scrollWidth - el.clientWidth);
  }

  const barClass = cn(
    'absolute z-10 rounded transition-opacity ease-out',
    active ? 'pointer-events-auto opacity-100 duration-300' : 'pointer-events-none opacity-0 duration-150',
  );

  return (
    <div
      ref={rootRef}
      className={cn('relative flex min-h-0 flex-col', className)}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => { if (!drag.current) setActive(false); }}
    >
      <div ref={setRefs} className={cn('scrollbar-none min-h-0 flex-1 overflow-auto', viewportClassName)}>
        {children}
      </div>
      {vertical.show ? (
        <div className={cn(barClass, 'bottom-0.5 right-0.5 top-0.5 hidden w-1.5 md:block')} onMouseDown={(event) => jump('y', event)}>
          <div
            className="absolute left-0 w-full cursor-pointer rounded bg-[#909399]/30 hover:bg-[#909399]/50"
            style={{ height: vertical.size, transform: `translateY(${vertical.move}px)` }}
            onPointerDown={(event) => startDrag('y', event)}
          />
        </div>
      ) : null}
      {horizontal.show ? (
        <div className={cn(barClass, 'bottom-0.5 left-0.5 right-0.5 hidden h-1.5 md:block')} onMouseDown={(event) => jump('x', event)}>
          <div
            className="absolute top-0 h-full cursor-pointer rounded bg-[#909399]/30 hover:bg-[#909399]/50"
            style={{ width: horizontal.size, transform: `translateX(${horizontal.move}px)` }}
            onPointerDown={(event) => startDrag('x', event)}
          />
        </div>
      ) : null}
    </div>
  );
});
