import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
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

/**
 * IconPark 星图空状态插画，画幅 400×300。
 * 按意图选用，不要按页面各配一张：
 * empty   还没有任何数据（列表为空、尚未建档）
 * search  有检索或筛选，但没有匹配结果
 * missing 资源不存在（404、档案找不到）
 * idle    没有待办，或当前无法继续（含 403）
 *
 * 尺寸：页面空态 240×180；嵌套/侧栏 compact 128×96。
 */
export function EmptyState({
  text,
  title,
  kind = 'empty',
  compact = false,
  action,
}: {
  text: string;
  title?: string;
  kind?: EmptyKind;
  compact?: boolean;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-1 flex-col items-center justify-center text-center',
        compact ? 'gap-1.5 px-3 py-3' : 'gap-3 px-4 py-8',
      )}
    >
      <img
        src={ILLUSTRATIONS[kind]}
        alt=""
        width={compact ? 128 : 240}
        height={compact ? 96 : 180}
        draggable={false}
        className={cn(
          'aspect-[4/3] h-auto shrink-0 select-none object-contain',
          compact ? 'w-32' : 'w-[240px] max-w-[min(240px,70vw)]',
        )}
      />
      {title ? <p className="text-sm font-medium text-slate-700">{title}</p> : null}
      <p className="max-w-[20rem] text-sm text-slate-400">{text}</p>
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}
