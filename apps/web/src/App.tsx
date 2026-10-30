import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { Alert } from './components/ui/alert';
import { Scrollbar } from './components/ui/scrollbar';
import { PatientListSkeleton, Skeleton } from './components/ui/skeleton';
import { ClinicSidebar, type PageKey } from './components/ClinicSidebar';
import { AdvisePage } from './pages/AdvisePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { ChatPage } from './pages/ChatPage';
import { DashboardPage } from './pages/DashboardPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { LoginPage } from './pages/LoginPage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
import { SkillsPage } from './pages/SkillsPage';
import { StatusPage } from './pages/StatusPage';
import { api } from './lib/api';
import { casePath, patientPath, savedListHref, useAppRoute } from './lib/route';
import { clearSession, greetingFor, readSession, rememberReturn, takeReturn, writeSession } from './lib/session';
import type { SessionUser } from './types';

export default function App() {
  const { route, navigate } = useAppRoute();
  const [user, setUser] = useState<SessionUser | null>(() => readSession()?.user ?? null);
  const [checking, setChecking] = useState(() => Boolean(readSession()));
  const [healthError, setHealthError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const page: PageKey = route.name === 'dashboard' ? 'dashboard' : route.name === 'knowledge' ? 'knowledge' : route.name === 'chat' ? 'chat' : route.name === 'advise' ? 'advise' : route.name === 'skills' ? 'skills' : route.name === 'notfound' || route.name === 'forbidden' ? 'skills' : 'patients';
  const patientKey = route.name === 'patient' || route.name === 'case' ? route.patientKey : null;
  const caseKey = route.name === 'case' ? route.caseKey : null;
  const statusCode = route.name === 'forbidden' ? 403 as const : route.name === 'notfound' ? 404 as const : null;

  useEffect(() => {
    const session = readSession();
    if (!session) {
      setChecking(false);
      return;
    }
    api.me().then((profile) => {
      writeSession({ token: session.token, user: profile });
      setUser(profile);
    }).catch(() => {
      clearSession();
      setUser(null);
    }).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    const sync = () => setUser(readSession()?.user ?? null);
    window.addEventListener('tcm-auth', sync);
    return () => window.removeEventListener('tcm-auth', sync);
  }, []);

  useEffect(() => {
    if (checking) return;
    if (user && route.name === 'login') {
      navigate(takeReturn(), true);
      return;
    }
    if (!user && route.name !== 'login' && route.name !== 'notfound' && route.name !== 'forbidden') {
      rememberReturn(`${window.location.pathname}${window.location.search}`);
      navigate('/login', true);
    }
  }, [checking, user, route.name, navigate]);

  useEffect(() => {
    if (!user) return;
    api.health().catch((err) => setHealthError(String(err)));
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function goto(next: PageKey) {
    navigate(next === 'patients' ? savedListHref() : next === 'dashboard' ? '/dashboard' : `/${next}`);
    setMenuOpen(false);
  }

  function logout() {
    clearSession();
    setUser(null);
    setMenuOpen(false);
    navigate('/login', true);
  }

  const inDetail = patientKey !== null;

  if (checking) {
    return (
      <div className="flex h-full min-h-0 overflow-hidden bg-white md:gap-3 md:bg-[#e7eef1] md:p-3" role="status" aria-label="正在进入诊所">
        <aside className="hidden h-full w-[188px] shrink-0 flex-col rounded-[22px] bg-[#175055] px-3 py-4 md:flex">
          <Skeleton className="h-8 w-32 bg-white/15" />
          <div className="mt-8 space-y-2">
            <Skeleton className="h-9 w-full bg-white/10" />
            <Skeleton className="h-9 w-full bg-white/10" />
            <Skeleton className="h-9 w-full bg-white/10" />
            <Skeleton className="h-9 w-full bg-white/10" />
          </div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white px-4 py-4 md:rounded-[22px] md:px-6 md:py-6">
          <Skeleton className="h-6 w-24" />
          <div className="mt-6 min-h-0 flex-1">
            <PatientListSkeleton count={4} />
          </div>
        </div>
      </div>
    );
  }

  if (!user && statusCode) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center overflow-hidden bg-white text-slate-800 md:bg-[#e7eef1] md:p-3">
        <div className="flex h-full w-full flex-col bg-white md:h-auto md:min-h-[420px] md:w-full md:max-w-md md:rounded-[22px]">
          <StatusPage code={statusCode} homeLabel="去登录" onHome={() => navigate('/login')} />
        </div>
      </div>
    );
  }

  if (!user || route.name === 'login') {
    return (
      <LoginPage
        onLoggedIn={(profile) => {
          setUser(profile);
          navigate(takeReturn(), true);
        }}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-white text-slate-800 md:gap-3 md:bg-[#e7eef1] md:p-3">
      <aside className="hidden h-full w-[188px] shrink-0 flex-col rounded-[22px] bg-[#175055] px-3 py-4 text-white md:flex">
        <ClinicSidebar page={page} inDetail={inDetail} user={user} onGoto={goto} onLogout={logout} />
      </aside>

      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="关闭目录" onClick={() => setMenuOpen(false)} />
          <aside className="filter-aside-in relative flex h-full w-[min(220px,86vw)] flex-col bg-[#175055] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pt-[max(1rem,env(safe-area-inset-top))] text-white shadow-xl">
            <ClinicSidebar page={page} inDetail={inDetail} user={user} onGoto={goto} onLogout={logout} userMenu="sheet" />
          </aside>
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white md:rounded-[22px]">
        <div className="flex shrink-0 items-center gap-2 pb-1 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <button
            type="button"
            aria-label="打开目录"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-[#175055] hover:bg-[#e7f4f2]"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-[#175055]">
            {statusCode === 404 ? '页面不存在' : statusCode === 403 ? '无权访问' : page === 'dashboard' ? '工作台' : page === 'knowledge' ? '知识库' : page === 'chat' ? 'AI 对话' : page === 'advise' ? '智能推荐' : page === 'skills' ? 'Skill' : '患者管理'}
          </p>
          {page === 'dashboard' ? (
            <p className="shrink-0 truncate text-xs text-slate-500">{greetingFor(user.name)}</p>
          ) : null}
          <div id="mobile-header-end" className="flex shrink-0 items-center" />
        </div>
        <Scrollbar
          className="min-h-0 flex-1"
          viewportClassName="flex flex-col overscroll-contain pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] md:px-6 md:py-6 md:pb-6"
        >
          {healthError ? (
            <Alert tone="warn" title="服务端暂未连通">
              当前只能看到界面。请确认 PostgreSQL 已启动，并在项目根目录执行 pnpm dev。{healthError}
            </Alert>
          ) : null}

          {statusCode ? (
            <StatusPage code={statusCode} onHome={() => navigate('/dashboard')} />
          ) : caseKey && patientKey ? (
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
          ) : page === 'dashboard' ? (
            <DashboardPage
              userName={user.name}
              onOpenPatient={(key) => navigate(patientPath(key))}
              onOpenList={(href) => navigate(href)}
              onOpenKnowledge={() => navigate('/knowledge')}
              onChat={() => navigate('/chat')}
            />
          ) : page === 'patients' ? (
            <PatientsPage onOpen={(key) => navigate(patientPath(key))} />
          ) : page === 'knowledge' ? (
            <KnowledgePage
              onOpenCase={(nextCaseKey, nextPatientKey) => navigate(casePath(nextPatientKey, nextCaseKey))}
            />
          ) : page === 'chat' ? (
            <ChatPage />
          ) : page === 'advise' ? (
            <AdvisePage />
          ) : (
            <SkillsPage />
          )}
        </Scrollbar>
      </div>
    </div>
  );
}
