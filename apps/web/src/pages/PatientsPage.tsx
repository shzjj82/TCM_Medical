import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { IntakeForm } from '../components/IntakeForm';
import { api } from '../lib/api';
import { pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';
import type { Patient } from '../types';

interface Props {
  onOpen: (key: string) => void;
}

export function PatientsPage({ onOpen }: Props) {
  const [rows, setRows] = useState<Patient[]>([]);
  const [keyword, setKeyword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showIntake, setShowIntake] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await api.listPatients(keyword || undefined));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [keyword]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜索姓名 / 编号 / 标签"
              className="pl-8"
            />
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            刷新
          </Button>
          <Button onClick={() => setShowIntake((v) => !v)}>
            <Plus className="h-4 w-4" />
            {showIntake ? '收起建档' : '建档'}
          </Button>
        </CardContent>
      </Card>

      {showIntake ? <IntakeForm onCreated={load} /> : null}
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">姓名</th>
                <th className="px-4 py-2 text-left font-medium">编号</th>
                <th className="px-4 py-2 text-left font-medium">主诉</th>
                <th className="px-4 py-2 text-left font-medium">诊疗次数</th>
                <th className="px-4 py-2 text-left font-medium">期初 / 末期</th>
                <th className="px-4 py-2 text-left font-medium">疗效</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    {loading ? '加载中…' : '暂无病人档案，点击「建档」录入第一位病人'}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const contrast = (row.contrast ?? {}) as Record<string, any>;
                  const initial = pickNumber(contrast.initial, 'severity_score', 'severityScore');
                  const latest = pickNumber(contrast.latest, 'severity_score', 'severityScore');
                  const verdict = pickField<string>(contrast.delta, 'verdict', 'verdict') ?? '待评估';
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0 hover:bg-secondary/40">
                      <td className="px-4 py-3 font-medium">
                        {row.name}
                        <span className="ml-1 text-xs font-normal text-muted-foreground">
                          {row.gender ?? ''}{row.age ? ` ${row.age}岁` : ''}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.externalId ?? row.id.slice(0, 8)}</td>
                      <td className="max-w-[240px] truncate px-4 py-3 text-muted-foreground">
                        {pickField<string>(row.initialCondition, 'chief_complaint', 'chiefComplaint') ?? '—'}
                      </td>
                      <td className="px-4 py-3">{row.visitCount}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {initial ?? '—'} → {latest ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={VERDICT_TONE[verdict] ?? 'secondary'}>{verdict}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => onOpen(row.externalId ?? row.id)}>
                          查看
                        </Button>
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
