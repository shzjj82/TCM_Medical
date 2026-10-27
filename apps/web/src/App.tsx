import { useEffect, useState } from 'react';
import { FileHeart, Leaf, Library, Sparkles, Wand2 } from 'lucide-react';
import { Alert } from './components/ui/alert';
import { Badge } from './components/ui/badge';
import { AdvisePage } from './pages/AdvisePage';
import { CaseDetailPage } from './pages/CaseDetailPage';
import { KnowledgePage } from './pages/KnowledgePage';
import { PatientDetailPage } from './pages/PatientDetailPage';
import { PatientsPage } from './pages/PatientsPage';
import { SkillsPage } from './pages/SkillsPage';
import { api } from './lib/api';

type PageKey = 'patients' | 'knowledge' | 'advise' | 'skills';

const NAV: Array<{ key: PageKey; label: string; icon: typeof FileHeart }> = [
  { key: 'patients', label: '病患', icon: FileHeart },
  { key: 'knowledge', label: '知识库', icon: Library },
  { key: 'advise', label: 'AI 建议', icon: Sparkles },
  { key: 'skills', label: 'Skill', icon: Wand2 },
];

export default function App() {
  const [page, setPage] = useState<PageKey>('patients');
  const [patientKey, setPatientKey] = useState<string | null>(null);
  const [caseKey, setCaseKey] = useState<string | null>(null);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>> | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    api.health().then(setHealth).catch((err) => setHealthError(String(err)));
  }, []);

  function goto(next: PageKey) {
    setPage(next);
    setPatientKey(null);
    setCaseKey(null);
  }

  function openPatient(key: string) {
    setPatientKey(key);
    setCaseKey(null);
  }

  function openCase(key: string) {
    setCaseKey(key);
  }

  const inDetail = patientKey !== null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <Leaf className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold leading-none">中医诊所医案沉淀平台</p>
              <p className="mt-1 text-xs text-muted-foreground">接诊 → 复诊 → 疗效 → 经验沉淀</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {health ? (
              <>
                <Badge variant="success">服务端已连接</Badge>
                <Badge variant={health.ai?.enabled ? 'success' : 'warning'}>
                  {health.ai?.enabled ? 'AI 已配置' : 'AI 未配置（规则模式）'}
                </Badge>
              </>
            ) : (
              <Badge variant="danger">服务端未连接</Badge>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1280px] gap-4 px-4 py-4 pb-24 md:pb-4">
        {/* 桌面端侧边栏 */}
        <aside className="hidden w-44 shrink-0 md:block">
          <nav className="space-y-1">
            {NAV.map((item) => {
              const Icon = item.icon;
              const active = page === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => goto(item.key)}
                  className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                    active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          {healthError ? (
            <Alert tone="warn" title="服务端暂未连通">
              当前仅能浏览静态界面。请在 packages/server 启动服务并确保 PostgreSQL 已就绪：{healthError}
            </Alert>
          ) : null}

          {caseKey && patientKey ? (
            <CaseDetailPage
              caseKey={caseKey}
              patientKey={patientKey}
              onBack={() => setCaseKey(null)}
            />
          ) : patientKey ? (
            <PatientDetailPage
              patientKey={patientKey}
              onBack={() => setPatientKey(null)}
              onOpenCase={openCase}
            />
          ) : page === 'patients' ? (
            <PatientsPage onOpen={openPatient} />
          ) : page === 'knowledge' ? (
            <KnowledgePage
              onOpenCase={(caseKey, patientKey) => {
                setPatientKey(patientKey);
                setCaseKey(caseKey);
              }}
            />
          ) : page === 'advise' ? (
            <AdvisePage />
          ) : (
            <SkillsPage />
          )}
        </main>
      </div>

      {/* H5 底部 TabBar：仅移动端展示，固定底部并适配安全区 */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = page === item.key || (item.key === 'patients' && inDetail);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => goto(item.key)}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground'
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
