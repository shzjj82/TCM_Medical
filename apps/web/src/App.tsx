import { useEffect, useState } from 'react';
import {
  BarChart3, BookOpen, ClipboardList, LayoutGrid, MessageSquare, Settings, Sparkles, User, UserRound, Wand2,
} from 'lucide-react';
import { Alert } from './components/ui/alert';
import { Scrollbar } from './components/ui/scrollbar';
import { AdvisePage } from './pages/AdvisePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
import { SkillsPage } from './pages/SkillsPage';
import { api } from './lib/api';
import { casePath, patientPath, savedListHref, useAppRoute } from './lib/route';

type PageKey = 'patients' | 'knowledge' | 'advise' | 'skills';

const NAV: Array<{ key: PageKey | 'soon'; label: string; icon: typeof User; enabled: boolean }> = [
  { key: 'soon', label: '工作台', icon: LayoutGrid, enabled: false },
  { key: 'patients', label: '患者管理', icon: UserRound, enabled: true },
  { key: 'soon', label: '医案管理', icon: ClipboardList, enabled: false },
  { key: 'knowledge', label: '知识库', icon: BookOpen, enabled: true },
  { key: 'advise', label: '智能推荐', icon: Sparkles, enabled: true },
  { key: 'soon', label: 'AI 对话', icon: MessageSquare, enabled: false },
  { key: 'soon', label: '统计分析', icon: BarChart3, enabled: false },
  { key: 'soon', label: '设置中心', icon: Settings, enabled: false },
];

export default function App() {
  const { route, navigate } = useAppRoute();
  const [healthError, setHealthError] = useState<string | null>(null);
  const page: PageKey = route.name === 'knowledge' ? 'knowledge' : route.name === 'advise' ? 'advise' : route.name === 'skills' ? 'skills' : 'patients';
  const patientKey = route.name === 'patient' || route.name === 'case' ? route.patientKey : null;
  const caseKey = route.name === 'case' ? route.caseKey : null;

  useEffect(() => {
    api.health().catch((err) => setHealthError(String(err)));
  }, []);

  function goto(next: PageKey) {
    navigate(next === 'patients' ? savedListHref() : `/${next}`);
  }

  const inDetail = patientKey !== null;
  const mobileNav = NAV.filter((item) => item.enabled);

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white text-slate-800 md:gap-3 md:bg-[#e7eef1] md:p-3">
      <aside className="hidden h-full w-[188px] shrink-0 flex-col rounded-[22px] bg-[#175055] px-3 py-4 text-white md:flex">
        <div className="flex items-center gap-2 px-1.5 pb-1 pt-1">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-white/80">
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
              <path d="M12 3.5c2.2 2.4 3.2 4.4 3.2 6.3a3.2 3.2 0 1 1-6.4 0C8.8 7.9 9.8 5.9 12 3.5Z" fill="none" stroke="white" strokeWidth="1.4" />
              <path d="M8.2 14.2c.8 2.6 2.2 4.4 3.8 6.3 1.6-1.9 3-3.7 3.8-6.3" fill="none" stroke="white" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </span>
          <p className="text-[13px] font-medium tracking-wide">沉浸中医诊所</p>
        </div>
        <nav className="mt-5 flex flex-1 flex-col gap-1">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.enabled && (page === item.key || (item.key === 'patients' && inDetail));
            return (
              <button
                key={item.label}
                type="button"
                aria-disabled={!item.enabled}
                title={item.enabled ? item.label : '后续版本开放'}
                onClick={() => { if (item.enabled && item.key !== 'soon') goto(item.key); }}
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
        <div className="mt-3 flex items-center gap-2.5 px-2 pb-1">
          <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[#d7ebe8] text-[#175055]">
            <User className="h-5 w-5" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13px] font-medium">张医生</p>
            <p className="mt-0.5 text-[11px] text-white/75">主治医师</p>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-[22px]">
        <Scrollbar
          className="min-h-0 flex-1"
          viewportClassName="flex flex-col overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(1.25rem,env(safe-area-inset-top))] pb-[calc(4.75rem+env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6"
        >
          {healthError ? (
            <Alert tone="warn" title="服务端暂未连通">
              当前只能看到界面。请确认 PostgreSQL 已启动，并在项目根目录执行 pnpm dev。{healthError}
            </Alert>
          ) : null}

          {caseKey && patientKey ? (
            <CaseDetailPage
              caseKey={caseKey}
              patientKey={patientKey}
              onBack={() => navigate(patientPath(patientKey))}
            />
          ) : patientKey ? (
            <PatientDetailPage
              patientKey={patientKey}
              onBack={() => navigate(savedListHref())}
              onOpenCase={(key) => navigate(casePath(patientKey, key))}
            />
          ) : page === 'patients' ? (
            <PatientsPage onOpen={(key) => navigate(patientPath(key))} />
          ) : page === 'knowledge' ? (
            <KnowledgePage
              onOpenCase={(nextCaseKey, nextPatientKey) => navigate(casePath(nextPatientKey, nextCaseKey))}
            />
          ) : page === 'advise' ? (
            <AdvisePage />
          ) : (
            <SkillsPage />
          )}
        </Scrollbar>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="grid grid-cols-4">
          {[...mobileNav, { key: 'skills' as PageKey, label: 'Skill', icon: Wand2, enabled: true }].map((item) => {
            const Icon = item.icon;
            const active = page === item.key || (item.key === 'patients' && inDetail);
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => { if (item.key !== 'soon') goto(item.key); }}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${active ? 'text-teal-700' : 'text-slate-400'}`}
              >
                <Icon className="h-5 w-5" />
                {item.label.replace('管理', '').replace('推荐', '')}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
