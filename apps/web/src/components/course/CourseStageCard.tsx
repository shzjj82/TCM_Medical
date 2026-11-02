import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Scrollbar } from '../ui/scrollbar';
import { CourseStageTitle } from './CourseStageTitle';
import type { VisitMedia } from '../../lib/visit-display';

export function CourseStageCard({
  title,
  date,
  lines,
  images = [],
  fill = false,
  hideTitle = false,
  embedded = false,
}: {
  title: string;
  date: string;
  lines: Array<[string, string]>;
  images?: VisitMedia[];
  fill?: boolean;
  hideTitle?: boolean;
  embedded?: boolean;
}) {
  const [preview, setPreview] = useState<VisitMedia | null>(null);
  if (!lines.length && !images.length) return null;
  return (
    <div className={`flex min-h-0 flex-col overflow-hidden ${embedded ? 'h-full px-4 pb-8 pt-2' : `rounded-2xl bg-[#f4fbf9] px-4 ${fill ? 'h-full pb-8 pt-4' : 'h-auto pb-4 pt-4 lg:h-72'}`}`}>
      {hideTitle ? null : <CourseStageTitle title={title} date={date} className="shrink-0 justify-between" />}
      <Scrollbar className={`${hideTitle ? '' : 'mt-3'} min-h-0 flex-1`} viewportClassName="space-y-2 text-sm leading-6 text-slate-600">
        {lines.map(([label, value]) => (
          <p key={label}><span className="text-slate-500">{label}：</span>{value}</p>
        ))}
        {images.length ? (
          <div className={`${lines.length ? 'pt-1' : ''} flex flex-wrap gap-2`}>
            {images.map((file) => (
              <button
                key={file.url}
                type="button"
                onClick={() => setPreview(file)}
                className="overflow-hidden rounded-lg bg-white/70 ring-1 ring-[#d7ebe7]"
              >
                <img src={file.url} alt={file.name} className="h-24 w-24 object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </Scrollbar>
      {preview ? <ImagePreview file={preview} onClose={() => setPreview(null)} /> : null}
    </div>
  );
}

function ImagePreview({ file, onClose }: { file: VisitMedia; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/70 p-6" onClick={onClose}>
      <img
        src={file.url}
        alt={file.name}
        className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain"
        onClick={(event) => event.stopPropagation()}
      />
    </div>,
    document.body,
  );
}
