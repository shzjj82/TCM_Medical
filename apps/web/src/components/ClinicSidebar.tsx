import { useState } from 'react';
import {
  BookOpen, LayoutGrid, LogOut, MessageSquare, User, UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { SessionUser } from '../types';
import { roleLabel } from '../lib/session';
import { Button } from './ui/button';
import { FormSheet } from './ui/form-sheet';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export type PageKey = 'dashboard' | 'patients' | 'knowledge' | 'chat' | 'advise' | 'skills';

export const NAV: Array<{ key: PageKey | 'soon'; label: string; icon: LucideIcon; enabled: boolean }> = [
  { key: 'dashboard', label: '工作台', icon: LayoutGrid, enabled: true },
  { key: 'patients', label: '患者管理', icon: UserRound, enabled: true },
  { key: 'knowledge', label: '知识库', icon: BookOpen, enabled: true },
  { key: 'chat', label: 'AI 对话', icon: MessageSquare, enabled: true },
];

export function ClinicMark() {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/80">
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
        <path d="M12 3.5c2.2 2.4 3.2 4.4 3.2 6.3a3.2 3.2 0 1 1-6.4 0C8.8 7.9 9.8 5.9 12 3.5Z" fill="none" stroke="white" strokeWidth="1.4" />
        <path d="M8.2 14.2c.8 2.6 2.2 4.4 3.8 6.3 1.6-1.9 3-3.7 3.8-6.3" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function ClinicSidebar({
  page,
  inDetail,
  user,
  onGoto,
  onLogout,
  userMenu = 'popover',
}: {
  page: PageKey;
  inDetail: boolean;
  user?: SessionUser | null;
  onGoto: (next: PageKey) => void;
  onLogout?: () => void;
  userMenu?: 'popover' | 'sheet';
}) {
  const [sheet, setSheet] = useState(false);
  const title = user?.title || (user ? roleLabel(user.role) : '');
  const name = user?.name || '未登录';

  function logout() {
    setSheet(false);
    onLogout?.();
  }

  const accountButton = (
    <button
      type="button"
      className="mt-3 flex w-full items-center gap-2.5 rounded-xl px-2 py-1.5 text-left hover:bg-white/10"
      aria-label="当前用户"
      onClick={userMenu === 'sheet' ? () => setSheet(true) : undefined}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d7ebe8] text-[#175055]">
        <User className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[13px] font-medium">{name}</span>
        {title ? <span className="mt-0.5 block text-[11px] text-white/75">{title}</span> : null}
      </span>
    </button>
  );

  return (
    <>
      <div className="flex items-center gap-2 px-1.5 pb-1 pt-1">
        <ClinicMark />
        <p className="text-[13px] font-medium tracking-wide">沉浸中医诊所</p>
      </div>
      <nav className="mt-5 flex flex-1 flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.enabled && (page === item.key || (item.key === 'patients' && inDetail) || (item.key === 'dashboard' && page === 'dashboard'));
          return (
            <button
              key={item.label}
              type="button"
              aria-disabled={!item.enabled}
              title={item.enabled ? item.label : '后续版本开放'}
              onClick={() => { if (item.enabled && item.key !== 'soon') onGoto(item.key); }}
              className={`flex w-full items-center gap-2.5 rounded-full px-3 py-2 text-[13px] transition-colors ${
                active ? 'bg-[#3a6f77] text-white' : 'text-white hover:bg-white/10'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </nav>
      {userMenu === 'sheet' ? (
        <>
          {accountButton}
          <FormSheet
            open={sheet}
            title="当前用户"
            onClose={() => setSheet(false)}
            layer="assist"
            footer={onLogout ? (
              <Button variant="outline" className="w-full border-slate-200" onClick={logout}>
                <LogOut className="h-4 w-4" strokeWidth={1.75} />
                退出登录
              </Button>
            ) : null}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d7ebe8] text-[#175055]">
                <User className="h-5 w-5" strokeWidth={1.75} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{name}</p>
                {title ? <p className="mt-0.5 truncate text-xs text-slate-400">{title}</p> : null}
              </div>
            </div>
          </FormSheet>
        </>
      ) : (
        <Popover>
          <PopoverTrigger asChild>
            {accountButton}
          </PopoverTrigger>
          <PopoverContent side="top" align="start" sideOffset={8} className="w-[200px] p-2">
            <div className="px-2 py-1.5">
              <p className="truncate text-sm font-medium text-slate-800">{name}</p>
              {title ? <p className="mt-0.5 truncate text-xs text-slate-400">{title}</p> : null}
            </div>
            {onLogout ? (
              <button
                type="button"
                onClick={logout}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <LogOut className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                退出登录
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      )}
    </>
  );
}
