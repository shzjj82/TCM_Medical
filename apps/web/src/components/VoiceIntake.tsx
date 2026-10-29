import { useRef, useState } from 'react';
import { Mic, Square, Upload } from 'lucide-react';
import { Button } from './ui/button';
import { api } from '../lib/api';
import type { CaseFormState } from './CaseForm';

export interface IntakeDraft {
  chiefComplaint?: string;
  presentIllness?: string;
  menstrualHistory?: string;
  dailyCondition?: string;
  tongue?: string;
  pulse?: string;
  signs?: string;
  westernDiagnosis?: string;
  tcmDisease?: string;
  tcmSyndrome?: string;
}

const TEXT_KEYS = [
  'chiefComplaint', 'presentIllness', 'menstrualHistory', 'dailyCondition',
  'tongue', 'pulse', 'signs', 'westernDiagnosis', 'tcmDisease', 'tcmSyndrome',
] as const;

export function applyIntakeDraft(form: CaseFormState, draft: IntakeDraft): CaseFormState {
  const next = { ...form };
  for (const key of TEXT_KEYS) {
    const value = draft[key];
    if (typeof value === 'string' && value.trim()) next[key] = value.trim();
  }
  return next;
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('无法读取录音文件'));
    reader.readAsDataURL(file);
  });
}

function draftFromFields(fields: Record<string, unknown>): IntakeDraft {
  const text = (key: (typeof TEXT_KEYS)[number]) => (typeof fields[key] === 'string' ? fields[key] : '');
  return {
    chiefComplaint: text('chiefComplaint'),
    presentIllness: text('presentIllness'),
    menstrualHistory: text('menstrualHistory'),
    dailyCondition: text('dailyCondition'),
    tongue: text('tongue'),
    pulse: text('pulse'),
    signs: text('signs'),
    westernDiagnosis: text('westernDiagnosis'),
    tcmDisease: text('tcmDisease'),
    tcmSyndrome: text('tcmSyndrome'),
  };
}

/** 录音或上传语音文件，识别后把字段交给表单。不直接保存档案。 */
export function VoiceIntake({
  disabled,
  blockedReason,
  onDraft,
  mode = 'both',
  layout = 'panel',
}: {
  disabled?: boolean;
  blockedReason?: string;
  onDraft: (draft: IntakeDraft, transcript: string) => void;
  /** record 只录音，upload 只上传音频，both 两个都有。 */
  mode?: 'record' | 'upload' | 'both';
  /** center 与文件解析一样，只把按钮放在中间。 */
  layout?: 'panel' | 'center';
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function recognize(file: File) {
    setBusy(true);
    setError(null);
    try {
      const audioBase64 = await readFile(file);
      const result = await api.transcribeIntake({ audioBase64, mime: file.type || 'audio/webm' });
      setTranscript(result.transcript);
      onDraft(draftFromFields(result.fields), result.transcript);
    } catch (err) {
      setError(String(err).replace(/^\d+\s*/, '').replace(/^Error:\s*/, ''));
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('当前浏览器不能录音');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      rec.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        void recognize(new File([blob], `intake.${extension}`, { type: blob.type || 'audio/webm' }));
      };
      rec.start();
      recorder.current = rec;
      setRecording(true);
      timer.current = window.setTimeout(() => stop(), 3 * 60 * 1000);
    } catch {
      setError('无法使用麦克风，请允许录音权限');
    }
  }

  function stop() {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    setRecording(false);
  }

  const recordButton = mode !== 'upload' ? (
    recording ? (
      <Button type="button" variant="outline" className="border-slate-200" onClick={stop} disabled={disabled}>
        <Square className="h-3.5 w-3.5" />停止并识别
      </Button>
    ) : (
      <Button type="button" variant="outline" className="border-slate-200" onClick={() => void start()} disabled={disabled || busy}>
        <Mic className="h-3.5 w-3.5" />{busy ? '识别中…' : '录音'}
      </Button>
    )
  ) : null;
  const uploadButton = mode !== 'record' ? (
    <Button type="button" variant="outline" className="border-slate-200" onClick={() => fileRef.current?.click()} disabled={disabled || busy || recording}>
      <Upload className="h-3.5 w-3.5" />{busy && mode === 'upload' ? '识别中…' : '上传音频'}
    </Button>
  ) : null;
  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept="audio/*,.webm,.wav,.mp3,.m4a,.ogg"
      className="hidden"
      onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void recognize(file);
      }}
    />
  );

  if (layout === 'center') {
    return (
      <div className="text-center">
        {recordButton}
        {uploadButton}
        {fileInput}
        {blockedReason ? <p className="mt-2 text-xs text-slate-400">{blockedReason}</p> : null}
        {transcript ? <p className="mt-2 text-xs leading-5 text-slate-600">转写：{transcript}</p> : null}
        {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50/80 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {recordButton}
        {uploadButton}
        {fileInput}
        <span className="text-xs text-slate-400">
          {blockedReason || (recording ? '正在录音，最长 3 分钟' : mode === 'upload' ? '上传后识别，结果填回当前页' : '识别结果请核对后再保存')}
        </span>
      </div>
      {transcript ? <p className="mt-2 text-xs leading-5 text-slate-600">转写：{transcript}</p> : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
