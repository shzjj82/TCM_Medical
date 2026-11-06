import { useState, type ReactNode } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { FormSheet } from './ui/form-sheet';
import { Input, Label, Textarea } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { api } from '../lib/api';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

type Mode = 'close' | 'refer' | 'follow';
type Efficacy = (typeof EFFICACY)[number];

const COPY: Record<Mode, { title: string; action: string }> = {
  close: { title: '结案', action: '确认结案' },
  refer: { title: '转诊', action: '确认转诊' },
  follow: { title: '随访', action: '保存随访' },
};

export const CLOSE_REASONS = [
  { id: 'recovered', label: '痊愈/临床改善' },
  { id: 'stage_end', label: '阶段性结束' },
  { id: 'patient_stop', label: '患者中止' },
  { id: 'lost', label: '失访' },
  { id: 'other', label: '其他' },
] as const;

const EFFICACY = ['临床痊愈', '显效', '有效', '好转', '无变化', '加重'] as const;

interface ContrastDraft {
  improved: string[];
  worsened: string[];
  added: string[];
  resolved: string[];
  unchanged: string[];
}

/** 展示用：好转/加重/新增/无明显变化；「消失」并入好转口径，不再单独对比。 */
const CONTRAST_ROWS: Array<{ key: Exclude<keyof ContrastDraft, 'resolved'>; label: string }> = [
  { key: 'improved', label: '好转' },
  { key: 'worsened', label: '加重' },
  { key: 'added', label: '新增' },
  { key: 'unchanged', label: '无明显变化' },
];

function messageOf(error: unknown): string {
  return String(error).replace(/^\d+\s*/, '').replace(/^Error:\s*/, '');
}

function compactText(value: string): string {
  return value.replace(/\s+/g, '');
}

function uniqueItems(items: string[]): string[] {
  const seen = new Set<string>();
  const rows: string[] = [];
  for (const item of items) {
    const key = compactText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    rows.push(item);
  }
  return rows;
}

function mentionedIn(text: string, item: string): boolean {
  const hay = compactText(text);
  const needle = compactText(item);
  return Boolean(hay && needle && hay.includes(needle));
}

/** 从「症状：头晕、耳鸣」这类标记行拆条目。 */
function parseLabeledItems(text: string, label: string): string[] {
  const match = text.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`));
  if (!match) return [];
  const body = match[1].trim();
  if (/^(无|没有|未见|已愈|消失|阴性)/.test(body)) return [];
  return body.split(/[,，、;/；]+/).map((item) => item.trim()).filter(Boolean);
}

function parseLabeledValue(text: string, label: string): string {
  const match = text.match(new RegExp(`${label}\\s*[：:]\\s*([^\\n]+)`));
  if (!match) return '';
  const body = match[1].trim();
  if (/^(无|没有|未见|未查|阴性)/.test(body)) return '';
  return body;
}

/** 期初症状：优先「症状：」行，并补上现病史里「头晕、耳鸣、腰膝酸软」这类顿号枚举。 */
function collectBaselineSymptoms(text: string): string[] {
  const labeled = parseLabeledItems(text, '症状');
  const extras: string[] = [];
  for (const match of text.matchAll(/(?:近)?(?:\d+|[一两三四])?(?:天|周|月|年)?([\u4e00-\u9fff]{2,8}(?:、[\u4e00-\u9fff]{2,8}){1,8})/g)) {
    const parts = match[1].split('、').map((item) => item.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    if (parts.some((item) => item.length > 8 || /舌象|脉象|诊断|处方|穴位|治法|加重|减轻|好转/.test(item))) continue;
    extras.push(...parts);
  }
  return uniqueItems([...labeled, ...extras]);
}

/**
 * 结案口径：期初有的症状，结案时不再写，视为已消失（好转）。
 * 不能把「没写」理解成「无明显变化」。
 */
function inferGoneSymptoms(previous: string, current: string): string[] {
  const before = collectBaselineSymptoms(previous);
  if (!before.length) return [];
  if (/症状\s*[：:]/.test(current)) {
    const after = collectBaselineSymptoms(current);
    return before.filter((item) => !after.some((row) => compactText(row) === compactText(item) || mentionedIn(row, item)));
  }
  return before.filter((item) => !mentionedIn(current, item));
}

/** 期初与结案都仍写到的症状 → 无明显变化。 */
function inferUnchangedSymptoms(previous: string, current: string): string[] {
  const before = collectBaselineSymptoms(previous);
  if (!before.length) return [];
  if (/症状\s*[：:]/.test(current)) {
    const after = collectBaselineSymptoms(current);
    return before.filter((item) => after.some((row) => compactText(row) === compactText(item) || mentionedIn(row, item) || mentionedIn(item, row)));
  }
  return before.filter((item) => mentionedIn(current, item));
}

/** 舌象/脉象两侧仍写且未写明变化 → 无明显变化。 */
function inferUnchangedSigns(previous: string, current: string): string[] {
  const rows: string[] = [];
  for (const label of ['舌象', '脉象']) {
    const before = parseLabeledValue(previous, label);
    const after = parseLabeledValue(current, label);
    if (!before || !after) continue;
    const same = compactText(before) === compactText(after)
      || mentionedIn(after, before)
      || mentionedIn(before, after);
    if (same) rows.push(before);
  }
  return rows;
}

function groundContrast(result: ContrastDraft, previous: string, current: string): ContrastDraft {
  const gone = inferGoneSymptoms(previous, current);
  // 好转/加重须在结案材料里写到变化；「消失」走 resolved，不要求本次再写该症状。
  const improved = uniqueItems(result.improved.filter((item) => mentionedIn(current, item)));
  const worsened = uniqueItems(result.worsened.filter((item) => mentionedIn(current, item)));
  const added = uniqueItems(result.added.filter((item) => mentionedIn(current, item)));
  const resolved = uniqueItems([
    ...gone,
    ...result.resolved.filter((item) => mentionedIn(previous, item) && !mentionedIn(current, item)),
  ]);
  const taken = new Set([...improved, ...worsened, ...added, ...resolved].map(compactText));
  const unchanged = uniqueItems([
    ...result.unchanged.filter((item) => mentionedIn(previous, item) && mentionedIn(current, item)),
    ...inferUnchangedSymptoms(previous, current),
    ...inferUnchangedSigns(previous, current),
  ]).filter((item) => !taken.has(compactText(item)));
  return { improved, worsened, added, resolved, unchanged };
}

/** 按对比结果粗判疗效，供医生一键采用后再改。无可对照变化时不给假「无变化」。 */
function suggestEfficacy(contrast: ContrastDraft): Efficacy | null {
  const good = contrast.improved.length + contrast.resolved.length;
  const bad = contrast.worsened.length + contrast.added.length;
  const flat = contrast.unchanged.length;
  if (good === 0 && bad === 0 && flat === 0) return null;
  if (bad > good) return '加重';
  if (good === 0 && bad === 0) return '无变化';
  if (contrast.resolved.length >= 2 && bad === 0) return '临床痊愈';
  if (contrast.resolved.length >= 1 && bad === 0 && good >= 2) return '显效';
  if (good >= 3 && bad === 0) return '显效';
  if (good >= 2 && bad <= 1) return '有效';
  if (good > bad) return '好转';
  return '无变化';
}

function displayContrast(contrast: ContrastDraft): ContrastDraft {
  return {
    ...contrast,
    improved: [...contrast.improved, ...contrast.resolved].filter(Boolean),
    resolved: [],
  };
}

function draftCloseSummary(_note: string, contrast: ContrastDraft, efficacy?: string): string {
  const shown = displayContrast(contrast);
  const parts = [
    ...CONTRAST_ROWS
      .map((row) => (shown[row.key].length ? `${row.label}：${shown[row.key].join('、')}` : ''))
      .filter(Boolean),
    efficacy ? `疗效评价：${efficacy}` : '',
  ].filter(Boolean);
  return parts.join('。');
}

/** 结案、转诊、随访。结案时 AI 对比期初与结案情况，由医生确认疗效和结案摘要。 */
export function CourseRecordForm({
  mode,
  caseKey,
  initialSummary = '',
  onClose,
  onSaved,
}: {
  mode: Mode;
  caseKey: string;
  initialSummary?: string;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [closeReason, setCloseReason] = useState('');
  const [efficacy, setEfficacy] = useState('');
  const [contrast, setContrast] = useState<ContrastDraft | null>(null);
  const [suggested, setSuggested] = useState<Efficacy | null>(null);
  const [sideOpen, setSideOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];
  const canCompare = mode === 'close' && Boolean(note.trim());

  async function generateContrast() {
    setError(null);
    if (!note.trim()) return setError('请先填写结案时情况，再查看对比');
    setComparing(true);
    try {
      const current = note.trim();
      const raw = await api.compareVisit({
        previous: initialSummary,
        current: `【结案对照】期初已写、本次未再写明的症状，视为已消失。\n${current}`,
      });
      const result = groundContrast(raw, initialSummary, current);
      setContrast(result);
      setSuggested(suggestEfficacy(result));
      setSideOpen(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setComparing(false);
    }
  }

  function applyFill() {
    if (!contrast || !suggested) return;
    setEfficacy(suggested);
    setSummary(draftCloseSummary(note, contrast, suggested));
  }

  async function submit() {
    setError(null);
    if (mode === 'refer' && !place.trim()) return setError('请填写转诊去向');
    if (mode === 'close' && !closeReason) return setError('请选择结案原因');
    if (mode === 'close' && !note.trim()) return setError('请填写结案时情况');
    if (mode === 'close' && !efficacy) return setError('请确认疗效评价');
    if (mode === 'close' && !summary.trim()) return setError('请确认结案摘要');
    if (mode === 'refer' && !note.trim()) return setError('请填写转诊原因');
    if (mode === 'follow' && !note.trim()) return setError('请填写随访内容');
    const reason = CLOSE_REASONS.find((item) => item.id === closeReason);
    const doctorNote = mode === 'refer'
      ? [`转往 ${place.trim()}`, note.trim()].filter(Boolean).join('\n')
      : mode === 'close' && reason
        ? [`结案原因：${reason.label}`, note.trim()].filter(Boolean).join('\n')
        : note.trim();
    setSaving(true);
    try {
      await api.addCaseVisit(caseKey, {
        text: mode === 'follow' ? note.trim() : undefined,
        doctorNote,
        date: date || undefined,
        kind: mode === 'follow' ? 'follow' : mode === 'refer' ? 'refer' : 'close',
        reviewStatus: 'confirmed',
        summary: mode === 'close' ? summary.trim() : undefined,
        keepSummary: mode !== 'close',
        nextPlan: mode === 'follow' && date ? date : undefined,
        outcome: mode === 'close' && reason
          ? {
              closeReason: reason.id,
              closeReasonLabel: reason.label,
              verdict: efficacy,
              doctor_conclusion: summary.trim(),
              symptom_changes: contrast ?? undefined,
            }
          : undefined,
      });
      await onSaved?.();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormSheet
      open
      title={copy.title}
      onClose={onClose}
      sideTitle="结案对比"
      side={sideOpen && mode === 'close' ? (
        <ContrastSide
          initialSummary={initialSummary}
          current={note}
          contrast={contrast}
          comparing={comparing}
          suggested={suggested}
          onApplyFill={applyFill}
        />
      ) : null}
      onSideCollapse={sideOpen ? () => setSideOpen(false) : undefined}
      onSideRefresh={sideOpen ? () => void generateContrast() : undefined}
      sideRefreshing={comparing}
      sideRefreshDisabled={!canCompare || saving}
      footer={(
        <div className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className={`flex flex-wrap items-center gap-2 ${mode === 'close' ? 'justify-between' : 'justify-end'}`}>
            {mode === 'close' ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 border-slate-200"
                disabled={(!canCompare && !contrast) || comparing || saving}
                onClick={() => {
                  if (sideOpen) {
                    setSideOpen(false);
                    return;
                  }
                  if (contrast) {
                    setSideOpen(true);
                    return;
                  }
                  void generateContrast();
                }}
              >
                {comparing ? '对比中…' : sideOpen ? '收起对比' : '查看对比'}
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              <Button type="button" variant="outline" className="h-9 border-slate-200" onClick={onClose} disabled={saving}>取消</Button>
              <Button type="button" className="h-9" onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : copy.action}</Button>
            </div>
          </div>
        </div>
      )}
    >
      <div className="space-y-4">
        {mode === 'close' ? <p className="text-sm text-slate-500">结案后不能再添加复诊、转诊和随访。</p> : null}
        {mode === 'refer' ? <p className="text-sm text-slate-500">转诊后疗程结束，不能再添加复诊、结案和随访。</p> : null}
        {mode === 'follow' ? <p className="text-sm text-slate-500">结案前可以随时添加随访，不计入治疗次数。</p> : null}
        {mode === 'refer' ? (
          <Field label="转诊去向">
            <Input className={controlClass} value={place} onChange={(event) => setPlace(event.target.value)} placeholder="医院、科室或医生" />
          </Field>
        ) : null}
        {mode === 'follow' ? (
          <Field label="随访日期">
            <DatePicker value={date} onChange={setDate} placeholder="选择随访日期" />
          </Field>
        ) : null}
        {mode === 'close' ? (
          <Field label="结案原因">
            <Select value={closeReason || undefined} onValueChange={setCloseReason}>
              <SelectTrigger className={controlClass}>
                <SelectValue placeholder="选择结束原因" />
              </SelectTrigger>
              <SelectContent>
                {CLOSE_REASONS.map((item) => (
                  <SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        ) : null}
        <Field label={mode === 'close' ? '结案时情况' : mode === 'refer' ? '转诊原因' : '随访内容'}>
          <Textarea
            className={`${controlClass} min-h-[96px] resize-y`}
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={mode === 'follow' ? '本次随访了解到的情况' : mode === 'close' ? '结案时的症状、舌脉和患者反馈' : '为什么转出'}
          />
        </Field>
        {mode === 'close' ? (
          <>
            <Field label="疗效评价">
              <Select value={efficacy || undefined} onValueChange={setEfficacy}>
                <SelectTrigger className={controlClass}>
                  <SelectValue placeholder="请医生确认疗效" />
                </SelectTrigger>
                <SelectContent>
                  {EFFICACY.map((item) => (
                    <SelectItem key={item} value={item}>{item}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="结案摘要">
              <Textarea
                className={`${controlClass} min-h-[84px] resize-y`}
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="可在右侧对比栏一键填入，再由医生确认修改"
              />
            </Field>
          </>
        ) : null}
      </div>
    </FormSheet>
  );
}

function ContrastSide({
  initialSummary,
  current,
  contrast,
  comparing,
  suggested,
  onApplyFill,
}: {
  initialSummary: string;
  current: string;
  contrast: ContrastDraft | null;
  comparing: boolean;
  suggested: Efficacy | null;
  onApplyFill: () => void;
}) {
  const shown = contrast ? displayContrast(contrast) : null;
  const draftSummary = contrast ? draftCloseSummary(current, contrast, suggested ?? undefined) : '';
  return (
    <div className="flex min-h-full flex-1 flex-col gap-4 pt-1">
      <div className="grid shrink-0 gap-3 sm:grid-cols-2">
        <SideBlock title="期初情况" text={initialSummary.trim() || '暂无期初记录'} />
        <SideBlock title="结案时情况" text={current.trim() || '—'} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-slate-200 bg-white px-3 py-3">
        <p className="shrink-0 text-sm font-medium text-slate-800">变化与建议</p>
        {comparing ? (
          <p className="mt-2 text-sm text-slate-400">正在对照期初与结案情况…</p>
        ) : !shown ? (
          <p className="mt-2 text-sm text-slate-400">填写结案时情况后，点底部「查看对比」</p>
        ) : (
          <div className="mt-2 flex min-h-0 flex-1 flex-col">
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
              {CONTRAST_ROWS.filter((row) => shown[row.key].length > 0).map((row) => (
                <li key={row.key} className="text-sm text-slate-700">
                  <span className="text-slate-400">{row.label}</span>
                  <span className="ml-2">{shown[row.key].join('、')}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex shrink-0 items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-slate-400">建议疗效评价</p>
                <p className="mt-1 text-sm text-[#175055]">{suggested ?? '—'}</p>
                <p className="mt-2 text-xs text-slate-400">结案摘要</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{draftSummary || '—'}</p>
              </div>
              <Button type="button" size="sm" className="h-8 shrink-0" disabled={!suggested} onClick={onApplyFill}>
                一键填入
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SideBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{text}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
