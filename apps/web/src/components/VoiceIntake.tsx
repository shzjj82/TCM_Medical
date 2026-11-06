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

/** 不超过该大小走同步识别；更大的先上传再交给听悟。 */
const ASR_MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_MAX_BYTES = 100 * 1024 * 1024;

type Phase = 'upload' | 'transcribe' | 'extract';

const PHASES: Record<'tingwu' | 'asr', Array<{ id: Phase; title: string; detail: string }>> = {
  tingwu: [
    { id: 'upload', title: '上传到云端', detail: '录音先存到云端，听悟才能读取这段音频。' },
    { id: 'transcribe', title: '听悟转写', detail: '通义听悟正在听录音。文件越长，这一步越久。' },
    { id: 'extract', title: '整理字段', detail: '把转写内容填回当前页，请核对后再保存。' },
  ],
  asr: [
    { id: 'transcribe', title: '识别语音', detail: '正在听这段短录音，并转成文字。' },
    { id: 'extract', title: '整理字段', detail: '把识别内容填回当前页，请核对后再保存。' },
  ],
};

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function ParseSteps({ pipeline, phase }: { pipeline: 'tingwu' | 'asr'; phase: Phase }) {
  const steps = PHASES[pipeline];
  const index = Math.max(0, steps.findIndex((step) => step.id === phase));
  return (
    <ol className="mx-auto mt-4 max-w-sm space-y-3 text-left">
      {steps.map((step, i) => {
        const state = i < index ? 'done' : i === index ? 'active' : 'wait';
        return (
          <li key={step.id} className="flex gap-3">
            <span
              className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                state === 'active' ? 'bg-[#e7f6f2] text-[#0f766e]' : state === 'done' ? 'bg-slate-100 text-slate-500' : 'bg-slate-50 text-slate-300'
              }`}
            >
              {state === 'active' ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#d7efe8] border-t-[#0f766e]" />
              ) : (
                i + 1
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-sm ${state === 'wait' ? 'text-slate-300' : 'text-slate-700'}`}>{step.title}</span>
              {state === 'active' ? (
                <>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500">{step.detail}</span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-slate-100">
                    <span className="block h-full w-1/2 animate-pulse rounded-full bg-[#0f766e]" />
                  </span>
                </>
              ) : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
  fillFields = true,
}: {
  disabled?: boolean;
  blockedReason?: string;
  onDraft: (draft: IntakeDraft, transcript: string, file?: File) => void | Promise<void>;
  /** record 只录音，upload 只上传音频，both 两个都有。 */
  mode?: 'record' | 'upload' | 'both';
  /** center 与文件解析一样，只把按钮放在中间。 */
  layout?: 'panel' | 'center';
  /** 为 false 时只交出转写，由调用方整理当前页字段。 */
  fillFields?: boolean;
}) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [pipeline, setPipeline] = useState<'tingwu' | 'asr'>('asr');
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function waitTranscript(jobId: string) {
    const started = Date.now();
    while (Date.now() - started < 20 * 60 * 1000) {
      const job = await api.getMediaJob(jobId);
      if (job.status === 'done') {
        const text = (job.transcript ?? '').trim();
        if (!text) throw new Error('没有识别到语音内容');
        return text;
      }
      if (job.status === 'failed') throw new Error(job.error || '转写失败');
      await sleep(3000);
    }
    throw new Error('转写时间较长，请稍后重试');
  }

  async function finish(transcript: string, fields: Record<string, unknown> | undefined, file: File) {
    setPhase('extract');
    const draft = fields ? draftFromFields(fields) : fillFields
      ? draftFromFields((await api.transcribeIntake({ transcript })).fields ?? {})
      : {};
    setTranscript(transcript);
    await onDraft(draft, transcript, file);
  }

  async function recognize(file: File) {
    const via: 'tingwu' | 'asr' = file.size > ASR_MAX_BYTES ? 'tingwu' : 'asr';
    setBusy(true);
    setError(null);
    setTranscript('');
    setPipeline(via);
    setPhase(via === 'tingwu' ? 'upload' : 'transcribe');
    try {
      if (file.size > AUDIO_MAX_BYTES) throw new Error('音频请控制在 100MB 以内');
      if (via === 'tingwu') {
        const stored = await api.uploadAudio(file);
        setPhase('transcribe');
        const result = await api.transcribeIntake({
          fileUrl: stored.url,
          mime: file.type || 'audio/mpeg',
          provider: 'tingwu',
        });
        const transcript = result.jobId && !result.transcript
          ? await waitTranscript(result.jobId)
          : (result.transcript ?? '').trim();
        if (!transcript) throw new Error('没有识别到语音内容');
        await finish(transcript, result.fields, file);
      } else {
        const audioBase64 = await readFile(file);
        const result = await api.transcribeIntake({ audioBase64, mime: file.type || 'audio/webm' });
        const transcript = (result.transcript ?? '').trim();
        if (!transcript) throw new Error('没有识别到语音内容');
        await finish(transcript, result.fields, file);
      }
    } catch (err) {
      setError(String(err).replace(/^\d+\s*/, '').replace(/^Error:\s*/, ''));
    } finally {
      setBusy(false);
      setPhase(null);
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
        <Mic className="h-3.5 w-3.5" />录音
      </Button>
    )
  ) : null;
  const uploadButton = mode !== 'record' ? (
    <Button type="button" variant="outline" className="border-slate-200" onClick={() => fileRef.current?.click()} disabled={disabled || busy || recording}>
      <Upload className="h-3.5 w-3.5" />上传音频
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
        {phase ? <ParseSteps pipeline={pipeline} phase={phase} /> : null}
        {transcript ? <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">转写：{transcript}</p> : null}
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
          {blockedReason || (recording ? '正在录音，最长 3 分钟' : mode === 'upload' ? '8MB 以内直接识别，更大的先上传再转写' : '识别结果请核对后再保存')}
        </span>
      </div>
      {phase ? <ParseSteps pipeline={pipeline} phase={phase} /> : null}
      {transcript ? <p className="mt-2 line-clamp-4 text-xs leading-5 text-slate-600">转写：{transcript}</p> : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
