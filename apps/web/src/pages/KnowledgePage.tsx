import { useState } from 'react';
import { BookOpen, Library, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Textarea } from '../components/ui/input';
import { TabItem, Tabs } from '../components/ui/tabs';
import { api } from '../lib/api';

/**
 * 资料库页：左侧检索，右侧手动录入外部参考资料。
 * 两条库的作用不同：外部库是人工录入的公开/文献证据；内部库由本院医案自动聚合。
 */
export function KnowledgePage() {
  const [tab, setTab] = useState('search');
  const [scope, setScope] = useState<'external' | 'internal'>('external');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      setRows(await api.searchKnowledge(scope, q, 8));
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabItem value="search" label="资料检索">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => setScope('external')}
                  className={`rounded px-3 py-1 text-xs ${scope === 'external' ? 'bg-card shadow' : 'text-muted-foreground'}`}
                >
                  外部参考库
                </button>
                <button
                  type="button"
                  onClick={() => setScope('internal')}
                  className={`rounded px-3 py-1 text-xs ${scope === 'internal' ? 'bg-card shadow' : 'text-muted-foreground'}`}
                >
                  内部资料库
                </button>
              </div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入病症 / 证型 / 穴位 / 方剂" className="min-w-[240px] flex-1" />
              <Button onClick={search} disabled={searching}>
                <Search className="h-4 w-4" />
                检索
              </Button>
            </CardContent>
          </Card>

          {error ? <Alert tone="danger">{error}</Alert> : null}

          <Card className="mt-4">
            <CardHeader>
              <CardTitle>
                {scope === 'external' ? '外部治疗参考资料' : '本院沉淀治疗方案'}（{rows.length}）
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  尚无结果。{scope === 'external' ? '可在「录入外部参考」页签手动录入。' : '可先沉淀医案后执行 `tcm.py kb build`。'}
                </p>
              ) : (
                rows.map((row) => (
                  <div key={String(row.id ?? row.title)} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{String(row.title ?? '—')}</p>
                      <Badge variant="outline">{String(row.score ?? 0)} 分</Badge>
                    </div>
                    <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-secondary/50 p-2 text-[11px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(row.payload, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabItem>

        <TabItem value="create" label="录入外部参考">
          <ReferenceForm />
        </TabItem>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
          <Library className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">内部 vs 外部资料库的职责边界</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>外部参考库：人工录入的经方、古籍、指南、论文病例，作为治疗的「外源证据」。</li>
              <li>内部资料库：由本院医案自动聚合生成（含有效率与源医案编号），是会诊时的「本院经验」。</li>
              <li>治疗建议会同时检索两者，且每条方案必须标注来源，无来源的建议不允许输出。</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ReferenceForm() {
  const empty = {
    title: '',
    source_type: '专家经验',
    source: '',
    tags: '',
    indications: '',
    syndromes: '',
    acupoints: '',
    prescriptions: '',
    treatment_principle: '',
    evidence_level: '专家经验',
    content: '',
  };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (key: keyof typeof empty, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  async function submit() {
    if (!form.title.trim()) return setError('标题为必填项');
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        sourceType: form.source_type,
        source: form.source || undefined,
        tags: split(form.tags),
        indications: split(form.indications),
        syndromes: split(form.syndromes),
        acupoints: split(form.acupoints),
        prescriptions: split(form.prescriptions),
        treatmentPrinciple: form.treatment_principle || undefined,
        evidenceLevel: form.evidence_level,
        content: form.content,
      };
      await fetch('/api/knowledge/external/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setDone(`已录入外部参考：${payload.title}`);
      setForm(empty);
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          手动录入外部治疗参考资料
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>
              标题<span className="text-destructive">*</span>
            </Label>
            <Input value={form.title} onChange={(e) => update('title', e.target.value)} placeholder="例：高血压（眩晕·肝阳上亢）取穴经验" />
          </div>
          <div className="space-y-1">
            <Label>
              出处<span className="text-xs font-normal text-muted-foreground"> 选填</span>
            </Label>
            <Input value={form.source} onChange={(e) => update('source', e.target.value)} placeholder="《针灸学》/ 2024 指南 / DOI" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>资料类型</Label>
            <Input value={form.source_type} onChange={(e) => update('source_type', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>证据等级</Label>
            <Input value={form.evidence_level} onChange={(e) => update('evidence_level', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>治则治法</Label>
            <Input value={form.treatment_principle} onChange={(e) => update('treatment_principle', e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>标签</Label>
            <Input value={form.tags} onChange={(e) => update('tags', e.target.value)} placeholder="眩晕, 高血压" />
          </div>
          <div className="space-y-1">
            <Label>适应症</Label>
            <Input value={form.indications} onChange={(e) => update('indications', e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>适用证型</Label>
            <Input value={form.syndromes} onChange={(e) => update('syndromes', e.target.value)} placeholder="肝阳上亢" />
          </div>
          <div className="space-y-1">
            <Label>取穴</Label>
            <Input value={form.acupoints} onChange={(e) => update('acupoints', e.target.value)} placeholder="曲池, 太冲" />
          </div>
          <div className="space-y-1">
            <Label>方剂</Label>
            <Input value={form.prescriptions} onChange={(e) => update('prescriptions', e.target.value)} placeholder="天麻钩藤饮" />
          </div>
        </div>

        <div className="space-y-1">
          <Label>正文</Label>
          <Textarea value={form.content} onChange={(e) => update('content', e.target.value)} placeholder="原文摘录、加减要点、注意事项…" />
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>
            {saving ? '保存中…' : '录入外部参考库'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function split(value: string): string[] {
  return value.split(/[,，、/|]+/).map((s) => s.trim()).filter(Boolean);
}
