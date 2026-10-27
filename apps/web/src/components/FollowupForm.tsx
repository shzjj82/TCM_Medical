import { useState } from 'react';
import { Calendar as CalendarIcon, Sparkles } from 'lucide-react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Calendar } from './ui/calendar';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input, Label, Textarea } from './ui/input';
import { api } from '../lib/api';

function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseDate(value: string): Date | undefined {
  const [y, m, d] = value.split('-').map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

interface Props { caseKey: string; onSaved?: () => void | Promise<void>; }

/**
 * 治疗记录录入（多次治疗）：文字 + 医生批注，可先做 AI 解析预览再提交。
 * 语音（实时 ASR / 录音文件上传）在下一阶段接入通义百炼后在此扩展。
 */
export function FollowupForm({ caseKey, onSaved }: Props) {
  const [text, setText] = useState('');
  const [doctorNote, setDoctorNote] = useState('');
  const [severity, setSeverity] = useState('');
  const [visitDate, setVisitDate] = useState(() => toDateString(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [parsed, setParsed] = useState<Record<string, unknown> | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function parsePreview() {
    if (!text && !doctorNote) return setError('请先填写现场记录或医生批注');
    setError(null); setParsing(true);
    try {
      setParsed(await api.parseNote({ text: text || undefined, doctorNote: doctorNote || undefined }));
    } catch (err) { setError(String(err)); setParsed(null); }
    finally { setParsing(false); }
  }

  async function submit() {
    if (!caseKey) return setError('缺少档案标识');
    if (!text && !doctorNote) return setError('至少填写现场记录或医生批注之一');
    setError(null); setDone(null); setSaving(true);
    try {
      const payload: Record<string, unknown> = {};
      if (text) payload.text = text;
      if (doctorNote) payload.doctorNote = doctorNote;
      if (severity) payload.severity = Number(severity);
      if (visitDate) payload.date = visitDate;
      if (parsed) { payload.parsed = parsed; payload.aiMode = 'llm'; }
      await api.addCaseVisit(caseKey, payload);
      setDone('治疗记录已录入，档案的疗效对比已更新。');
      setText(''); setDoctorNote(''); setSeverity(''); setVisitDate(toDateString(new Date())); setCalendarOpen(false); setParsed(null);
      await onSaved?.();
    } catch (err) { setError(String(err)); }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <CardHeader><CardTitle>录入本次治疗</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>医生批注<span className="text-xs font-normal text-muted-foreground"> 选填（经验沉淀的主要来源，原样保留）</span></Label>
          <Textarea value={doctorNote} onChange={(e) => setDoctorNote(e.target.value)}
            placeholder="例：取曲池、太冲平肝潜阳，配足三里调理中焦气机，平补平泻，留针 20 分钟" />
        </div>
        <div className="space-y-1">
          <Label>现场记录<span className="text-xs font-normal text-muted-foreground"> 选填</span></Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="患者自述、舌脉变化等" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>本次严重度<span className="text-xs font-normal text-muted-foreground"> 选填（0~10，疗效对比依据）</span></Label>
            <Input value={severity} onChange={(e) => setSeverity(e.target.value)} inputMode="numeric" placeholder="0-10" />
          </div>
          <div className="space-y-1">
            <Label>就诊日期<span className="text-xs font-normal text-muted-foreground"> 默认今天，点击修改</span></Label>
            <button
              type="button"
              onClick={() => setCalendarOpen((v) => !v)}
              className="flex h-9 w-full items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm transition-colors hover:bg-secondary/60"
            >
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              {visitDate}
            </button>
            {calendarOpen ? (
              <div className="flex justify-center rounded-md border border-border bg-card">
                <Calendar
                  selected={parseDate(visitDate)}
                  onSelect={(date: Date | undefined) => {
                    if (date) setVisitDate(toDateString(date));
                    setCalendarOpen(false);
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>

        {parsed ? (
          <pre className="max-h-56 overflow-auto rounded bg-secondary/60 p-2 text-[11px] leading-relaxed">
            {JSON.stringify(parsed, null, 2)}
          </pre>
        ) : null}

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={parsePreview} disabled={parsing || saving}>
            <Sparkles className="h-4 w-4" />{parsing ? '解析中…' : parsed ? '重新解析' : 'AI 解析预览'}
          </Button>
          <Button onClick={submit} disabled={saving || parsing}>
            {saving ? '提交中…' : parsed ? '按解析结果提交' : '提交治疗记录'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
