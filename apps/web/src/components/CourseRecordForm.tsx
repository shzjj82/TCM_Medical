import { useState, type ReactNode } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { DatePicker } from './ui/date-picker';
import { FormSheet } from './ui/form-sheet';
import { Input, Label, Textarea } from './ui/input';
import { api } from '../lib/api';

const controlClass = 'rounded-lg border-slate-200 bg-white shadow-none focus-visible:border-[#175055] focus-visible:ring-0';

type Mode = 'close' | 'refer' | 'follow';

const COPY: Record<Mode, { title: string; action: string }> = {
  close: { title: '结案', action: '确认结案' },
  refer: { title: '转诊', action: '确认转诊' },
  follow: { title: '随访', action: '保存随访' },
};

function messageOf(error: unknown): string {
  return String(error).replace(/^\d+\s*/, '').replace(/^Error:\s*/, '');
}

/** 结案、转诊、随访。结案和转诊会结束疗程；随访在结束前可以多次添加。 */
export function CourseRecordForm({
  mode,
  caseKey,
  onClose,
  onSaved,
}: {
  mode: Mode;
  caseKey: string;
  onClose: () => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [place, setPlace] = useState('');
  const [date, setDate] = useState('');
  const [summary, setSummary] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];

  async function submit() {
    setError(null);
    if (mode === 'refer' && !place.trim()) return setError('请填写转诊去向');
    if (mode !== 'follow' && !note.trim()) return setError(mode === 'close' ? '请填写结案说明' : '请填写转诊原因');
    if (mode === 'follow' && !note.trim()) return setError('请填写随访内容');
    const doctorNote = mode === 'refer' ? [`转往 ${place.trim()}`, note.trim()].filter(Boolean).join('\n') : note.trim();
    setSaving(true);
    try {
      await api.addCaseVisit(caseKey, {
        text: mode === 'follow' ? note.trim() : undefined,
        doctorNote,
        date: date || undefined,
        kind: mode === 'follow' ? 'follow' : mode === 'refer' ? 'refer' : 'close',
        reviewStatus: 'confirmed',
        summary: mode === 'close' ? (summary.trim() || note.trim()) : undefined,
        keepSummary: mode !== 'close',
        nextPlan: mode === 'follow' && date ? date : undefined,
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
      footer={(
        <div className="space-y-3">
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="border-slate-200" onClick={onClose} disabled={saving}>取消</Button>
            <Button type="button" onClick={() => void submit()} disabled={saving}>{saving ? '保存中…' : copy.action}</Button>
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
        <Field label={mode === 'close' ? '结案说明' : mode === 'refer' ? '转诊原因' : '随访内容'}>
          <Textarea
            className={`${controlClass} min-h-[96px] resize-y`}
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={mode === 'follow' ? '本次随访了解到的情况' : mode === 'close' ? '疗效、医嘱和结束原因' : '为什么转出'}
          />
        </Field>
        {mode === 'close' ? (
          <Field label="末期摘要">
            <Textarea
              className={`${controlClass} min-h-[84px] resize-y`}
              rows={3}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              placeholder="留空时用结案说明作为末期摘要"
            />
          </Field>
        ) : null}
      </div>
    </FormSheet>
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
