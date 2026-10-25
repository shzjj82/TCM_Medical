import { useState } from 'react';
import { ShieldAlert, Sparkles } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/input';
import { api } from '../lib/api';
import type { AdviseResult } from '../types';

/** 输入一段病人情况（自由文本），联合外部参考库 + 内部资料库 + 本院医案给出建议。 */
export function AdvisePage() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdviseResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!text.trim()) return setError('请输入病人情况');
    setLoading(true);
    setError(null);
    try {
      setResult(await api.advise({ text, topK: 5 }));
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const plan = result?.plan;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>输入病人情况，获取治疗建议</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="例：女，58 岁，头晕耳鸣、腰膝酸软，血压 160/95，舌红少苔，脉弦细"
            className="min-h-[120px]"
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={loading}>
              <Sparkles className="h-4 w-4" />
              {loading ? '检索并生成中…' : '生成建议'}
            </Button>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          {result.safetyAlerts.length ? (
            <Alert tone="danger" title="安全红线：请先排除急重症">
              {result.safetyAlerts.join('、')}
            </Alert>
          ) : (
            <Alert tone="info">未命中急重症红线词，仍需常规鉴别诊断。</Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                治疗方案
                <Badge variant={result.mode === 'llm' ? 'success' : 'warning'}>
                  {result.mode === 'llm' ? 'AI 综合生成' : '资料检索草稿'}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p>
                <span className="text-muted-foreground">治则治法：</span>
                <span className="font-medium">{plan?.treatmentPrinciple ?? '—'}</span>
              </p>

              <div>
                <p className="font-medium">针灸取穴</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(plan?.acupuncturePlan ?? []).length === 0 ? <span className="text-xs text-muted-foreground">无匹配方案</span> : null}
                  {(plan?.acupuncturePlan ?? []).map((item, index) => (
                    <span key={`${item.point}-${index}`} className="rounded-md border border-border bg-secondary/50 px-2 py-1 text-xs">
                      {item.point}
                      <span className="ml-1 text-muted-foreground">
                        {item.manipulation ?? ''} 留针 {item.retentionMin ?? item.retention_min ?? '—'} 分钟
                      </span>
                      <span className="ml-1 font-mono text-[10px] text-primary">[{item.source}]</span>
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <p className="font-medium">方药</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {(plan?.herbalPlan ?? []).map((item, index) => (
                    <li key={`${item.formula}-${index}`}>
                      {item.formula}
                      {item.modification ? `（${item.modification}）` : ''}
                      <span className="ml-1 font-mono text-[10px] text-primary">[{item.source}]</span>
                    </li>
                  ))}
                </ul>
              </div>

              {plan?.lifestyleAdvice?.length ? (
                <div>
                  <p className="font-medium">调摄医嘱</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
                    {plan.lifestyleAdvice.map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="text-xs text-muted-foreground">随访安排：{plan?.followupPlan ?? '—'}</p>
              <p className="text-xs text-muted-foreground">置信度：{plan?.confidence ?? '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4" />
                证据来源
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-xs md:grid-cols-3">
              <EvidenceColumn title={`外部参考（${result.external.length}）`} rows={result.external.map((r) => String(r.title ?? r.id ?? '—'))} />
              <EvidenceColumn title={`内部资料（${result.internal.length}）`} rows={result.internal.map((r) => String(r.title ?? r.id ?? '—'))} />
              <EvidenceColumn title={`本院医案（${result.cases.length}）`} rows={result.cases.map((r) => String(r.ref ?? '—'))} />
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">{result.disclaimer}</p>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceColumn({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="font-medium text-foreground">{title}</p>
      <ul className="mt-2 space-y-1 text-muted-foreground">
        {rows.length ? rows.slice(0, 6).map((row, index) => <li key={index}>· {row}</li>) : <li>无命中</li>}
      </ul>
    </div>
  );
}
