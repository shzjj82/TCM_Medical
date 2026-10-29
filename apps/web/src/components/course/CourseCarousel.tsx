import { useRef, useState, type ReactElement } from 'react';

export function CourseCarousel({
  slides,
  onIndexChange,
}: {
  slides: Array<ReactElement | null>;
  onIndexChange?: (index: number) => void;
}) {
  const items = slides.filter((item): item is ReactElement => item != null);
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  function pageWidth(el: HTMLDivElement) {
    const gap = Number.parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0;
    return el.clientWidth + gap;
  }

  function sync(next: number) {
    const clamped = Math.min(items.length - 1, Math.max(0, next));
    setIndex(clamped);
    onIndexChange?.(clamped);
  }

  function onScroll() {
    const el = scroller.current;
    if (!el || el.clientWidth === 0) return;
    sync(Math.round(el.scrollLeft / pageWidth(el)));
  }

  function go(next: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: next * pageWidth(el), behavior: 'smooth' });
  }

  if (items.length === 0) return null;
  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={onScroll}
        className="scrollbar-none flex h-56 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain"
      >
        {items.map((item, i) => (
          <div key={item.key ?? i} className="h-56 w-full min-w-full shrink-0 snap-start">
            {item}
          </div>
        ))}
      </div>
      {items.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex items-center justify-center gap-1.5">
          {items.map((item, i) => (
            <button
              key={item.key ?? i}
              type="button"
              aria-label={`第 ${i + 1} 屏`}
              aria-current={i === index ? true : undefined}
              onClick={() => go(i)}
              className={`pointer-events-auto h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-[#1a8f78]' : 'w-1.5 bg-[#1a8f78]/25'}`}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
