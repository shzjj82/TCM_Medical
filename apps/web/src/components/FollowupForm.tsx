import { useState } from 'react';
import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Input, Label, Textarea } from './ui/input';
import { api } from '../lib/api';

interface Props {
  patientKey: string;
  onSaved?: () => void | Promise<void>;
}

/**
 * 复诊跟进录入：语音 / 图片 / 文字 + 医生批注。
 * 语音与图片填的**服务端可见的绝对路径**（Skill 的 ASR/Vision Provider 需要读文件），
 * 未配置 Provider 时文件仍会归档并标记为待人工补录。
 */
export function FollowupForm({ patientKey, onSaved }: Props) {
  const [text, setText] = useState('');
  const [doctorNote, setDoctorNote] = useState('');
  const [audio, setAudio] = useState('');
  const [image, setImage] = useState('');
  const [severity, setSeverity] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function submit() {
    if (!patientKey) return setError('缺少病人标识');
    if (!text && !doctorNote && !audio && !image) return setError('至少提供一种素材：文字、医生批注、语音或图片');
    setError(null);
    setDone(null);
    setSaving(true);
    try {
      const params: Record<string, unknown> = { patient: patientKey, format: 'json' };
      if (text) params.text = text;
      if (doctorNote) params['doctor-note'] = doctorNote;
      if (audio) params.audio = audio;
      if (image) params.image = image;
      if (severity) params.severity = Number(severity);
      if (visitDate) params['visit-date'] = visitDate;
      await api.runSkill('tcm_followup', params);
      setDone('跟进已录入，AI 解析结果标记为「待医师确认」。');
      setText('');
      setDoctorNote('');
      setAudio('');
      setImage('');
      setSeverity('');
      setVisitDate('');
      await onSaved?.();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>录入本次跟进</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1">
          <Label>
            医生批注<span className="text-xs font-normal text-muted-foreground"> 选填（经验沉淀的主要来源，原样保留）</span>
          </Label>
          <Textarea
            value={doctorNote}
            onChange={(e) => setDoctorNote(e.target.value)}
            placeholder="例：高血压取曲池、太冲，糖尿病配承山，加足三里以调中焦气机，平补平泻，留针 20 分钟"
          />
        </div>

        <div className="space-y-1">
          <Label>
            现场记录<span className="text-xs font-normal text-muted-foreground"> 选填</span>
          </Label>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="患者自述、查房记录等" />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>
              语音文件路径<span className="text-xs font-normal text-muted-foreground"> 选填（需配置 ASR）</span>
            </Label>
            <Input value={audio} onChange={(e) => setAudio(e.target.value)} placeholder="/abs/path/复诊录音.m4a" />
          </div>
          <div className="space-y-1">
            <Label>
              图片文件路径<span className="text-xs font-normal text-muted-foreground"> 选填（需配置 Vision）</span>
            </Label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} placeholder="/abs/path/舌苔20260312.jpg" />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>
              本次严重度<span className="text-xs font-normal text-muted-foreground"> 选填（留空则沿用上次）</span>
            </Label>
            <Input value={severity} onChange={(e) => setSeverity(e.target.value)} inputMode="numeric" placeholder="0-10" />
          </div>
          <div className="space-y-1">
            <Label>
              就诊日期<span className="text-xs font-normal text-muted-foreground"> 选填（留空为今天）</span>
            </Label>
            <Input type="date" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
          </div>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}
        {done ? <Alert tone="success">{done}</Alert> : null}

        <div className="flex justify-end">
          <Button onClick={submit} disabled={saving}>
            {saving ? 'AI 解析中…' : '提交跟进'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
