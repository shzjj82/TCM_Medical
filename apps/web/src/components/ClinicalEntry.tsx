import { useRef, useState, type ReactNode } from 'react';
import { Sparkles } from 'lucide-react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { FormSheet } from './ui/form-sheet';
import { Input, Label, Textarea } from './ui/input';
import { TabItem, Tabs } from './ui/tabs';
import { VoiceIntake } from './VoiceIntake';
import { api } from '../lib/api';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

export type ClinicalTab = 'chart' | 'condition' | 'plan';
export const CLINICAL_TABS: ClinicalTab[] = ['chart', 'condition', 'plan'];
type AssistMode = 'voice' | 'file' | 'audio';

export interface ClinicalValue {
  chiefComplaint: string;
  presentIllness: string;
  symptoms: string;
  tongue: string;
  pulse: string;
  westernDiagnosis: string;
  tcmDisease: string;
  tcmSyndrome: string;
  principle: string;
  acupoints: string;
  prescriptions: string;
  lifestyle: string;
}

export function nextClinicalTab(tab: ClinicalTab): ClinicalTab | null {
  const index = CLINICAL_TABS.indexOf(tab);
  return index >= 0 && index < CLINICAL_TABS.length - 1 ? CLINICAL_TABS[index + 1] : null;
}

/** 当前页必填未完成时返回提示，通过则返回 null。 */
export function clinicalTabIssue(tab: ClinicalTab, value: ClinicalValue): string | null {
  if (tab !== 'chart') return null;
  const missing = [
    !value.chiefComplaint.trim() ? '主诉' : '',
    !value.presentIllness.trim() ? '现病史' : '',
  ].filter(Boolean);
  if (!missing.length) return null;
  return `请填写${missing.join('和')}`;
}

export interface TongueDraft {
  name: string;
  file: File;
  preview: string;
}

const FIELD_LABEL: Record<string, string> = {
  chiefComplaint: '主诉',
  presentIllness: '现病史',
  symptoms: '症状',
  tongue: '舌象',
  pulse: '脉象',
  westernDiagnosis: '西医诊断',
  tcmDisease: '中医病名',
  tcmSyndrome: '证型',
  principle: '治则',
  acupoints: '取穴',
  prescriptions: '方剂',
  lifestyle: '调摄',
};

const SECTION_KEYS: Record<ClinicalTab, Array<keyof ClinicalValue>> = {
  chart: ['chiefComplaint', 'presentIllness'],
  condition: ['symptoms', 'tongue', 'pulse'],
  plan: ['westernDiagnosis', 'tcmDisease', 'tcmSyndrome', 'principle', 'acupoints', 'prescriptions', 'lifestyle'],
};

const ASSIST: Array<{ id: AssistMode; label: string; image: string; text: string }> = [
  { id: 'voice', label: '实时语音', image: '/assist/voice.jpg', text: '点击录音，说完这一页的内容后停止，识别结果会填回表单。' },
  { id: 'file', label: '文件解析', image: '/assist/file.jpg', text: '上传文字材料。舌象图片请在目前情况里直接上传。' },
  { id: 'audio', label: '音频分析', image: '/assist/talk.jpg', text: '上传一段问诊录音，识别后填回当前页。' },
];

function messageOf(error: unknown): string {
  return String(error).replace(/^\d+\s*/, '').replace(/^Error:\s*/, '');
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('无法读取文件'));
    reader.readAsDataURL(file);
  });
}

export async function uploadTongue(draft: TongueDraft | null): Promise<{ url: string; name: string } | null> {
  if (!draft) return null;
  const imageBase64 = await readFile(draft.file);
  return api.uploadTongue({ imageBase64, mime: draft.file.type || 'image/jpeg', name: draft.name });
}

/** 病例诊断、目前情况、诊断方案。每页都可以用语音、文件或对话填入。 */
export function ClinicalEntry({
  tab,
  onTab,
  value,
  onChange,
  tongue,
  onTongue,
  aiAllowed,
  saving,
  conditionExtra,
  planExtra,
}: {
  tab: ClinicalTab;
  onTab: (tab: ClinicalTab) => void;
  value: ClinicalValue;
  onChange: (key: keyof ClinicalValue, next: string) => void;
  tongue: TongueDraft | null;
  onTongue: (next: TongueDraft | null) => void;
  aiAllowed: boolean;
  saving?: boolean;
  conditionExtra?: ReactNode;
  planExtra?: ReactNode;
}) {
  const [assist, setAssist] = useState(false);
  const [notice, setNotice] = useState('');

  function applyFields(fields: Record<string, string>) {
    const filled = SECTION_KEYS[tab]
      .map((key) => [key, (fields[key] ?? '').trim()] as const)
      .filter(([, text]) => text);
    if (!filled.length) {
      setNotice('材料里没有提到这一页的内容。');
      return;
    }
    for (const [key, text] of filled) onChange(key, text);
    setNotice(`已填入${filled.map(([key]) => FIELD_LABEL[key]).join('、')}，请在页面上核对。`);
    setAssist(false);
  }

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(next) => onTab(next as ClinicalTab)}
        variant="line"
        stableHeight
        end={(
          <Button type="button" size="sm" variant="outline" className="border-slate-200" onClick={() => setAssist(true)} disabled={saving}>
            <Sparkles className="h-3.5 w-3.5" />
            智能填写
          </Button>
        )}
      >
        <TabItem value="chart" label="病例诊断" fill>
          <div className="flex h-full min-h-0 flex-1 flex-col gap-4">
            {notice && tab === 'chart' ? <p className="text-xs text-slate-500">{notice}</p> : null}
            <Field label="主诉" required>
              <Input className={controlClass} value={value.chiefComplaint} onChange={(event) => onChange('chiefComplaint', event.target.value)} placeholder="症状 + 持续时间，例如头晕头胀 3 月" />
            </Field>
            <Field label="现病史" required className="flex min-h-0 flex-1 flex-col">
              <Textarea className={`${controlClass} min-h-[96px] flex-1 resize-y`} value={value.presentIllness} onChange={(event) => onChange('presentIllness', event.target.value)} placeholder="起病经过、诊治经过、当前变化" />
            </Field>
          </div>
        </TabItem>
        <TabItem value="condition" label="目前情况">
          <div className="space-y-4">
            {notice && tab === 'condition' ? <p className="text-xs text-slate-500">{notice}</p> : null}
            <Field label="症状">
              <Textarea className={`${controlClass} min-h-[72px] resize-y`} rows={2} value={value.symptoms} onChange={(event) => onChange('symptoms', event.target.value)} placeholder="头晕、头胀、耳鸣" />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="舌象"><Input className={controlClass} value={value.tongue} onChange={(event) => onChange('tongue', event.target.value)} placeholder="舌红苔黄" /></Field>
              <Field label="脉象"><Input className={controlClass} value={value.pulse} onChange={(event) => onChange('pulse', event.target.value)} placeholder="弦" /></Field>
            </div>
            <TongueDrop value={tongue} onChange={onTongue} disabled={saving} />
            {conditionExtra}
          </div>
        </TabItem>
        <TabItem value="plan" label="诊断方案">
          <div className="space-y-4">
            {notice && tab === 'plan' ? <p className="text-xs text-slate-500">{notice}</p> : null}
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="中医病名"><Input className={controlClass} value={value.tcmDisease} onChange={(event) => onChange('tcmDisease', event.target.value)} placeholder="眩晕" /></Field>
              <Field label="证型"><Input className={controlClass} value={value.tcmSyndrome} onChange={(event) => onChange('tcmSyndrome', event.target.value)} placeholder="肝阳上亢" /></Field>
              <div className="md:col-span-2">
                <Field label="西医诊断"><Input className={controlClass} value={value.westernDiagnosis} onChange={(event) => onChange('westernDiagnosis', event.target.value)} placeholder="如高血压病" /></Field>
              </div>
              <div className="md:col-span-2">
                <Field label="治则"><Input className={controlClass} value={value.principle} onChange={(event) => onChange('principle', event.target.value)} placeholder="平肝潜阳" /></Field>
              </div>
              <Field label="取穴"><Input className={controlClass} value={value.acupoints} onChange={(event) => onChange('acupoints', event.target.value)} placeholder="曲池，太冲" /></Field>
              <Field label="方剂"><Input className={controlClass} value={value.prescriptions} onChange={(event) => onChange('prescriptions', event.target.value)} placeholder="天麻钩藤饮" /></Field>
              <div className="md:col-span-2">
                <Field label="调摄"><Input className={controlClass} value={value.lifestyle} onChange={(event) => onChange('lifestyle', event.target.value)} placeholder="低盐饮食，规律作息" /></Field>
              </div>
            </div>
            {planExtra}
          </div>
        </TabItem>
      </Tabs>
      {assist ? (
        <AssistDialog
          tab={tab}
          aiAllowed={aiAllowed}
          onClose={() => setAssist(false)}
          onApply={applyFields}
          onTongue={onTongue}
        />
      ) : null}
    </>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <div className={`space-y-1 ${className ?? ''}`}>
      <Label className="flex items-center gap-1">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

function TongueDrop({ value, onChange, disabled }: { value: TongueDraft | null; onChange: (next: TongueDraft | null) => void; disabled?: boolean }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');

  function take(file?: File) {
    setError('');
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请上传图片');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('舌象图片请控制在 5MB 以内');
      return;
    }
    if (value?.preview) URL.revokeObjectURL(value.preview);
    onChange({ name: file.name, file, preview: URL.createObjectURL(file) });
  }

  return (
    <div className="space-y-2">
      <Label>舌象图片</Label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => { if (!disabled) inputRef.current?.click(); }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click(); }}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          if (!disabled) take(event.dataTransfer.files?.[0]);
        }}
        className={`grid min-h-[148px] place-items-center rounded-xl border border-dashed px-4 py-5 text-center ${over ? 'border-[#175055] bg-[#f4fbf9]' : 'border-slate-200 bg-slate-50/70'}`}
      >
        {value ? (
          <img src={value.preview} alt={value.name} className="max-h-36 rounded-lg object-contain" />
        ) : (
          <div>
            <p className="text-sm text-slate-700">拖拽舌象图片到这里，或点击上传</p>
            <p className="mt-1 text-xs text-slate-400">支持 jpg、png，5MB 以内</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          take(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {value ? (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>{value.name}</span>
          <button type="button" className="text-[#175055]" onClick={() => { URL.revokeObjectURL(value.preview); onChange(null); }}>移除</button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function AssistDialog({
  tab,
  aiAllowed,
  onClose,
  onApply,
  onTongue,
}: {
  tab: ClinicalTab;
  aiAllowed: boolean;
  onClose: () => void;
  onApply: (fields: Record<string, string>) => void;
  onTongue: (next: TongueDraft | null) => void;
}) {
  const [mode, setMode] = useState<AssistMode>('voice');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Array<[string, string]>>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const blocked = aiAllowed ? undefined : '患者未授权 AI，不能录音或解析';

  async function extract(text: string) {
    const result = await api.extractSection({ text, section: tab });
    const rows = Object.entries(result.fields).filter(([, value]) => value.trim());
    setPreview(rows.map(([key, value]) => [FIELD_LABEL[key] ?? key, value]));
    if (!rows.length) {
      setError('材料里没有提到这一页的内容');
      return;
    }
    onApply(result.fields);
  }

  async function fromTranscript(transcript: string) {
    setBusy(true);
    setError(null);
    try { await extract(transcript); }
    catch (err) { setError(messageOf(err)); }
    finally { setBusy(false); }
  }

  async function fromFile(file: File) {
    if (file.type.startsWith('image/')) {
      if (tab !== 'condition') {
        setError('图片请放到目前情况的舌象上传');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('舌象图片请控制在 5MB 以内');
        return;
      }
      onTongue({ name: file.name, file, preview: URL.createObjectURL(file) });
      setPreview([['舌象图片', file.name]]);
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (file.type.startsWith('audio/') || /\.(webm|wav|mp3|m4a|ogg)$/i.test(file.name)) {
        setError('音频请用音频分析上传');
        return;
      }
      const text = await file.text();
      if (!text.trim()) {
        setError('文件里没有可解析的文字');
        return;
      }
      if (!aiAllowed) {
        setError('患者未授权 AI，不能解析文字');
        return;
      }
      await extract(text);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormSheet
      open
      layer="assist"
      title="智能填写"
      onClose={onClose}
      footer={preview.length ? <p className="text-xs text-slate-500">解析结果已写回当前页，请核对后再保存。</p> : null}
    >
      <Tabs value={mode} onValueChange={(next) => setMode(next as AssistMode)} variant="line" stableHeight>
        {ASSIST.map((item) => (
          <TabItem key={item.id} value={item.id} label={item.label}>
            <div className="space-y-4">
              <img src={item.image} alt="" className="mx-auto h-36 w-36 rounded-2xl object-cover" />
              <p className="text-center text-sm text-slate-500">{item.text}</p>
              {item.id === 'voice' ? (
                <VoiceIntake
                  mode="record"
                  layout="center"
                  disabled={!aiAllowed || busy}
                  blockedReason={blocked}
                  onDraft={(_draft, transcript) => { if (transcript.trim()) void fromTranscript(transcript); }}
                />
              ) : null}
              {item.id === 'file' ? (
                <div className="text-center">
                  <Button type="button" variant="outline" className="border-slate-200" disabled={busy} onClick={() => fileRef.current?.click()}>
                    {busy ? '解析中…' : '选择文件'}
                  </Button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="text/plain,image/*,.txt,.md"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (file) void fromFile(file);
                    }}
                  />
                  {blocked ? <p className="mt-2 text-xs text-slate-400">{blocked}</p> : null}
                </div>
              ) : null}
              {item.id === 'audio' ? (
                <VoiceIntake
                  mode="upload"
                  layout="center"
                  disabled={!aiAllowed || busy}
                  blockedReason={blocked}
                  onDraft={(_draft, transcript) => { if (transcript.trim()) void fromTranscript(transcript); }}
                />
              ) : null}
              {error ? <Alert tone="danger">{error}</Alert> : null}
              {preview.length ? (
                <div className="space-y-1 rounded-lg bg-[#f4fbf9] px-3 py-2 text-sm leading-6 text-slate-700">
                  {preview.map(([label, text]) => <p key={label}>{label}：{text}</p>)}
                </div>
              ) : null}
            </div>
          </TabItem>
        ))}
      </Tabs>
    </FormSheet>
  );
}
