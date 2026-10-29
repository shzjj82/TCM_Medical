import emptyUrl from '../../assets/empty/empty.svg';
import idleUrl from '../../assets/empty/idle.svg';
import searchUrl from '../../assets/empty/search.svg';
import missingUrl from '../../assets/empty/missing.svg';

const ILLUSTRATIONS = {
  empty: emptyUrl,
  idle: idleUrl,
  search: searchUrl,
  missing: missingUrl,
} as const;

export type EmptyKind = keyof typeof ILLUSTRATIONS;

/** IconPark 星图空状态插画，配色改成诊所青绿。 */
export function EmptyState({
  text,
  kind = 'empty',
}: {
  text: string;
  kind?: EmptyKind;
}) {
  return (
    <div className="flex min-h-[240px] flex-1 flex-col items-center justify-center gap-2 py-8">
      <img src={ILLUSTRATIONS[kind]} alt="" className="h-36 w-auto select-none" draggable={false} />
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  );
}
