import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Plus, RefreshCw, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { IntakeForm } from '../components/IntakeForm';
import { api } from '../lib/api';
import { pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';
import type { CaseRecord, Patient } from '../types';

interface Props { onOpen: (key: string) => void; }

/** 从档案的 contrast 中提取列表展示所需的多次治疗结果。 */
function caseContrast(caseRecord?: CaseRecord) {
  if (!caseRecord) return null;
  const contrast = (caseRecord.contrast ?? {}) as Record<string, any>;
  const initial = pickNumber(contrast.initial, 'severity_score', 'severityScore');
  const latest = pickNumber(contrast.latest, 'severity_score', 'severityScore');
  const verdict = pickField<string>(contrast.delta, 'verdict', 'verdict') ?? '待评估';
  return { visits: caseRecord.visitCount, initial, latest, verdict, chiefComplaint: caseRecord.chiefComplaint };
}

function VerdictBadge({ verdict }: { verdict: string }) {
  return <Badge variant={VERDICT_TONE[verdict] ?? 'secondary'}>{verdict}</Badge>;
}

export function PatientsPage({ onOpen }: Props) {
  const [rows, setRows] = useState<Patient[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setRows(await api.listPatients(keyword || undefined)); }
    catch (err) { setError(String(err)); }
    finally { setLoading(false); }
  }, [keyword]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={keyword} onChange={(e) => setKeyword(e.target.value)}
                   placeholder="搜索姓名 / 编号 / 标签" className="pl-8" />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />刷新
          </Button>
          <Button onClick={() => setShowIntake((v) => !v)}>
            <Plus className="h-4 w-4" />{showIntake ? '收起' : '建档'}
          </Button>
        </CardContent>
      </Card>

      {showIntake ? (
        <IntakeForm
          onCreated={() => {
            setShowIntake(false);
            void load();
          }}
        />
      ) : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      {/* 移动端：卡片流 */}
      <div className="space-y-3 md:hidden">
        {rows.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            {loading ? '加载中…' : '暂无病患档案，点击「建档」录入第一位病患'}
          </Card>
        ) : (
          rows.map((row) => {
            const info = caseContrast(row.latestCase);
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => onOpen(row.externalId ?? row.id)}
                className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors active:bg-secondary/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {row.name}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      {row.gender ?? ''}{row.age ? ` ${row.age}岁` : ''}
                    </span>
                  </p>
                  {info ? <VerdictBadge verdict={info.verdict} /> : <Badge variant="outline">待建档</Badge>}
                </div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                  {info ? info.chiefComplaint : '尚未建立就诊档案'}
                </p>
                {info ? (
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>治疗 {info.visits} 次</span>
                    <span>严重度 {info.initial ?? '—'} → {info.latest ?? '—'}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                ) : null}
              </button>
            );
          })
        )}
      </div>

      {/* 桌面端：表格 */}
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">姓名</th>
                <th className="px-4 py-2 text-left font-medium">最近档案主诉</th>
                <th className="px-4 py-2 text-left font-medium">治疗次数</th>
                <th className="px-4 py-2 text-left font-medium">期初 / 末期</th>
                <th className="px-4 py-2 text-left font-medium">疗效</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                  {loading ? '加载中…' : '暂无病患档案，点击「建档」录入第一位病患'}
                </td></tr>
              ) : (
                rows.map((row) => {
                  const info = caseContrast(row.latestCase);
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-3 font-medium">
                        {row.name}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {row.gender ?? ''}{row.age ? ` ${row.age}岁` : ''}
                        </span>
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground">
                        {info?.chiefComplaint ?? '（待建档）'}
                      </td>
                      <td className="px-4 py-3">{info ? info.visits : '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {info ? `${info.initial ?? '—'} → ${info.latest ?? '—'}` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {info ? <VerdictBadge verdict={info.verdict} /> : <Badge variant="outline">待建档</Badge>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onOpen(row.externalId ?? row.id)}>查看</Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
