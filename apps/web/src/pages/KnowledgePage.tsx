import { useEffect, useState } from 'react';
import { Archive, BookOpen, Library, Search } from 'lucide-react';
import { Alert } from '../components/ui/alert';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Textarea } from '../components/ui/input';
import { TabItem, Tabs } from '../components/ui/tabs';
import { api } from '../lib/api';
import { pickField, pickNumber, VERDICT_TONE } from '../lib/coerce';
import type { CaseRecord } from '../types';

interface Props {
  /** 点击归档条目回看档案全文（App 层路由到 CaseDetailPage）。 */
  onOpenCase?: (caseKey: string, patientKey: string) => void;
}

/**
 * 资料库页：内部（归档医案）/ 检索 / 外部录入。
 * 归档医案 = 内部知识库的数据来源：病患信息 + 疾病信息 + 多次治疗结果，归档时自动生成。
 */
export function KnowledgePage({ onOpenCase }: Props) {
  const [tab, setTab] = useState('archive');
  const [scope, setScope] = useState<'external' | 'internal'>('external');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Array<Record<string, any>>>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searched, setSearched] = useState(false);

  /** 检索/浏览。空关键词 = 浏览全部（后端返回前 topK 条）。 */
  const search = async (scopeOverride?: 'external' | 'internal', qOverride?: string) => {
    const useScope = scopeOverride ?? scope;
    const useQ = qOverride ?? q;
    setSearching(true);
    setError(null);
    try {
      setRows(await api.searchKnowledge(useScope, useQ, 8));
      setSearched(true);
    } catch (err) {
      setError(String(err));
    } finally {
      setSearching(false);
    }
  };

  /** 首次进入检索页签时自动浏览外部参考库，避免「录入后看不到」。 */
  useEffect(() => {
    if (tab === 'search' && !searched) void search('external', '');
  }, [tab, searched]);

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={setTab}>
        <TabItem value="archive" label="归档医案">
          <ArchiveList onOpenCase={onOpenCase} />
        </TabItem>

        <TabItem value="search" label="资料检索">
          <Card>
            <CardContent className="flex flex-wrap items-center gap-2 p-4">
              <div className="flex items-center gap-1 rounded-md bg-secondary p-1">
                <button
                  type="button"
                  onClick={() => { setScope('external'); void search('external', q); }}
                  className={`rounded px-3 py-1 text-xs ${scope === 'external' ? 'bg-card shadow' : 'text-muted-foreground'}`}
                >
                  外部参考库
                </button>
                <button
                  type="button"
                  onClick={() => { setScope('internal'); void search('internal', q); }}
                  className={`rounded px-3 py-1 text-xs ${scope === 'internal' ? 'bg-card shadow' : 'text-muted-foreground'}`}
                >
                  内部资料库
                </button>
              </div>
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="输入病症 / 证型 / 穴位 / 方剂" className="min-w-[240px] flex-1" />
              <Button onClick={() => void search()} disabled={searching}>
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
                  {searched
                    ? (scope === 'external' ? '没有匹配的外部参考。可切换关键词重试，或到「录入外部参考」页签录入。' : '内部资料库暂无匹配，归档医案后会自动沉淀。')
                    : '加载中…'}
                </p>
              ) : (
                rows.map((row) => (
                  <div key={String(row.id ?? row.title)} className="rounded-md border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{String(row.title ?? '—')}</p>
                      {Number(row.score ?? 0) > 0 ? <Badge variant="outline">{String(row.score ?? 0)} 分</Badge> : null}
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
          <ReferenceForm
            onSaved={() => {
              // 录入成功后立即切到检索页签并展示外部参考库，让新条目直接可见
              setScope('external');
              setQ('');
              setTab('search');
              void search('external', '');
            }}
          />
        </TabItem>
      </Tabs>

      <Card className="border-dashed">
        <CardContent className="flex items-start gap-3 p-4 text-xs text-muted-foreground">
          <Library className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium text-foreground">归档机制与知识库职责边界</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>如何归档：在「病患 → 档案详情」右上角点击「归档」并二次确认。归档后档案只读、不可再添加治疗，并自动生成快照（病患信息 + 疾病信息 + 全部治疗记录 + 疗效对比）。</li>
              <li>内部知识库（归档医案页签）：完全由归档动作自动生成，无需手动录入，是会诊时的「本院经验」。</li>
              <li>外部参考库：人工录入的经方、古籍、指南、论文病例，作为治疗的「外源证据」。</li>
              <li>治疗建议同时检索两者，每条方案必须标注来源，无来源的建议不允许输出。</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** 归档医案列表：内部知识库的数据界面，展示病患信息 + 疾病信息 + 多次治疗结果。 */
function ArchiveList({ onOpenCase }: { onOpenCase?: (caseKey: string, patientKey: string) => void }) {
  const [rows, setRows] = useState<CaseRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.listArchivedCases()
      .then(setRows)
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Archive className="h-4 w-4" />
            归档医案（{rows.length}）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">加载中…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              暂无归档。前往「病患 → 档案详情 → 归档」，档案归档后会自动出现在这里。
            </p>
          ) : (
            rows.map((row) => {
              const snapshot = (row.archiveSnapshot ?? {}) as Record<string, any>;
              const patient = row.patient ?? snapshot.patient;
              const patientKey = row.patientId ?? patient?.id ?? row.id;
              const contrast = (row.contrast ?? {}) as Record<string, any>;
              const initial = pickNumber(contrast.initial, 'severity_score', 'severityScore');
              const latest = pickNumber(contrast.latest, 'severity_score', 'severityScore');
              const delta = (contrast.delta ?? {}) as Record<string, any>;
              const verdict = pickField<string>(delta, 'verdict', 'verdict');
              const rate = pickNumber(delta, 'improvement_rate', 'improvementRate');
              const plan = row.treatmentPlan ?? {};
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => onOpenCase?.(row.externalId ?? row.id, patientKey)}
                  className="w-full rounded-md border border-border p-3 text-left transition-colors hover:bg-secondary/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {row.tcmDisease ?? '未命名病'}
                      {row.tcmSyndrome ? <span className="ml-1 text-xs font-normal text-muted-foreground">（{row.tcmSyndrome}）</span> : null}
                      {verdict ? <Badge className="ml-2" variant={VERDICT_TONE[verdict] ?? 'secondary'}>{verdict}</Badge> : null}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      归档于 {row.archivedAt ? String(row.archivedAt).slice(0, 10) : '—'}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>病患：{patient?.name ?? '—'}{patient?.gender ? ` ${patient.gender}` : ''}{patient?.age ? ` ${patient.age}岁` : ''}</span>
                    <span>治疗 {row.visitCount} 次</span>
                    <span>严重度 {initial ?? '—'} → {latest ?? '—'}</span>
                    {rate !== undefined ? <span>改善 {Math.round(rate * 100)}%</span> : null}
                  </div>

                  <p className="mt-2 line-clamp-1 text-xs text-muted-foreground">主诉：{row.chiefComplaint}</p>
                  {plan.acupoints?.length || plan.prescriptions?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {plan.acupoints?.slice(0, 6).map((p) => (
                        <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{p}</span>
                      ))}
                      {plan.prescriptions?.map((p) => (
                        <span key={p} className="rounded bg-secondary px-1.5 py-0.5 text-[11px]">{p}</span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReferenceForm({ onSaved }: { onSaved?: () => void }) {
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
      await api.syncExternalReference(payload);
      setDone(`已录入外部参考：${payload.title}`);
      setForm(empty);
      onSaved?.();
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
