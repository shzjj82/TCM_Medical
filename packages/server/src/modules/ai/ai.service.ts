import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ChatMessage, DeepSeekClient, extractJson } from '@tcm/agents';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { PatientsService } from '../patients/patients.service';
import { VisitsService } from '../patients/visits.service';
import { pick, toArray } from '../../common/payload';

export interface AdviseResult {
  mode: 'llm' | 'rule_based' | 'rule_based_fallback';
  safetyAlerts: string[];
  plan?: Record<string, unknown>;
  external: Array<Record<string, unknown>>;
  internal: Array<Record<string, unknown>>;
  cases: Array<Record<string, unknown>>;
  disclaimer: string;
}

const EMERGENCY_FLAGS = [
  '胸痛剧烈', '意识障碍', '昏迷', '大出血', '急腹症', '剧烈腹痛',
  '卒中', '偏瘫失语', '呼吸困难', '高热不退', '妊娠', '孕妇',
  '十八反', '十九畏',
];

const DISCLAIMER = '本内容由 AI 辅助生成，须经执业医师审核后使用，不得直接作为处方交付患者。';

const ADVISE_SYSTEM = `你是给中医师提供决策支持的助手（不直接面向患者开方）。
规则：
1. 只依据【参考资料】作答，每条建议用 [来源ID] 标注出处；
2. 资料不足时写"证据不足，建议上级医师会诊"，不要发挥；
3. 先输出安全红线自查结论；
4. 只输出 JSON 对象。`;

const PARSE_SYSTEM = `你是资深中医师兼病案管理员，把口语化的接诊记录整理为规范门诊病历。
不确定字段填 null 并在 uncertainFields 列出，绝不臆造剂量与既往史。只输出 JSON。`;

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly client = new DeepSeekClient();

  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
  ) {}

  status() {
    return {
      ...this.client.status(),
      asr: process.env.ASR_PROVIDER ?? 'none',
      vision: process.env.VISION_PROVIDER ?? 'none',
    };
  }

  /** 联合「外部参考库 + 内部资料库 + 本院高疗效医案」给出治疗建议。 */
  async recommend(input: { text?: string; patientId?: string; topK?: number }): Promise<AdviseResult> {
    const topK = input.topK ?? 5;
    let caseText = input.text ?? '';
    let patientRef: string | undefined;

    if (input.patientId) {
      const patient = await this.patients.findOne(input.patientId);
      patientRef = patient.externalId ?? patient.id;
      const initial = (patient.initialCondition ?? {}) as Record<string, any>;
      const current = (patient.currentCondition ?? initial) as Record<string, any>;
      caseText = [
        `姓名：${patient.name}　性别：${patient.gender ?? '-'}　年龄：${patient.age ?? '-'}`,
        `已诊疗：${patient.visitCount} 次`,
        `主诉：${initial.chief_complaint ?? initial.chiefComplaint ?? '-'}`,
        `现病史：${initial.present_illness ?? initial.presentIllness ?? '-'}`,
        `当前情况：${current.summary ?? '-'}`,
        `中医病名：${current.tcm_disease ?? current.tcmDisease ?? '-'}　证型：${current.tcm_syndrome ?? current.tcmSyndrome ?? '-'}`,
        `舌脉：${current.tongue ?? '-'}　${current.pulse ?? '-'}`,
        `严重度：${current.severity_score ?? current.severityScore ?? '-'}`,
        input.text ? `补充说明：${input.text}` : '',
      ].join('\n');
    }

    const [external, internal, visits] = await Promise.all([
      this.knowledge.searchExternal(caseText, topK),
      this.knowledge.searchInternal(caseText, topK),
      patientRef ? this.visits.listForPatient(patientRef).catch(() => []) : Promise.resolve([]),
    ]);

    const cases = visits.slice(-5).map((visit) => ({
      ref: `CASE-${patientRef}#V${visit.visitNo}`,
      date: visit.date,
      summary: String(pick(visit.parsed ?? {}, ['treatment_principle', 'treatmentPrinciple']) ?? ''),
      doctorNote: visit.doctorNote ?? '',
    }));

    const safetyAlerts = EMERGENCY_FLAGS.filter((flag) => caseText.includes(flag));
    const result: AdviseResult = {
      mode: 'rule_based',
      safetyAlerts,
      external: external.map((r) => r.payload),
      internal: internal.map((r) => r.payload),
      cases,
      disclaimer: DISCLAIMER,
    };

    if (!this.client.enabled) {
      result.plan = {
        treatmentPrinciple: '证据不足（未配置 AI）',
        acupuncturePlan: internal.flatMap((row) => toArray(pick(row.payload, ['acupoints'])).map((p) => ({
          point: p, source: row.id,
        }))),
        note: '未配置 LLM_API_KEY（通义百炼），仅返回资料库检索结果，未做综合推理。',
      };
      return result;
    }

    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: ADVISE_SYSTEM },
        {
          role: 'user',
          content: [
            '【病人情况】\n' + caseText,
            '【外部治疗参考资料库】\n' + JSON.stringify(result.external).slice(0, 8000),
            '【内部治疗资料库】\n' + JSON.stringify(result.internal).slice(0, 8000),
            '【本院相似医案】\n' + JSON.stringify(cases).slice(0, 4000),
            '输出 JSON：{caseProfile:{tcmDisease,tcmSyndrome,keySymptoms},safetyAlerts:[],treatmentPrinciple,acupuncturePlan:[{point,manipulation,retentionMin,rationale,source}],herbalPlan:[{formula,modification,source}],lifestyleAdvice:[],followupPlan,evidenceSummary:{externalHits,internalHits,caseHits,insufficientFields},confidence}',
          ].join('\n\n'),
        },
      ];
      const plan = await this.client.chatJson<Record<string, unknown>>(messages, { reasoner: true, temperature: 0.2 });
      result.plan = plan;
      result.mode = 'llm';
      return result;
    } catch (error) {
      this.logger.warn(`AI 建议生成失败，降级为检索草稿: ${String(error)}`);
      result.mode = 'rule_based_fallback';
      result.plan = { note: 'AI 生成失败，以下仅为资料库命中结果。', error: String(error).slice(0, 300) };
      return result;
    }
  }

  /** 把一段医生口述/录音转写解析成结构化医案。可用于前端预览后再落库。 */
  async parseNote(input: { text?: string; doctorNote?: string }) {
    const material = input.doctorNote || input.text || '';
    if (!material) throw new Error('缺少待解析内容');
    if (!this.client.enabled) throw new Error('未配置 LLM_API_KEY（通义百炼），无法调用 AI 解析');
    const raw = await this.client.chat([
      { role: 'system', content: PARSE_SYSTEM },
      {
        role: 'user',
        content: `素材：\n${material}\n\n输出结构：{visitDate,narrative,tcmDisease,tcmSyndrome,treatmentPrinciple,symptoms:[],tongue,pulse,acupoints:[{name,manipulation,retentionMin,rationale}],prescriptions:[{name,composition}],advice:[],nextPlan,uncertainFields:[]}`,
      },
    ], { temperature: 0.2 });
    return extractJson<Record<string, unknown>>(raw);
  }

  /**
   * 录音文件先转写，再拆进主诉字段。不落库，由前端核对后随建档提交。
   */
  async transcribeIntake(input: { audioBase64?: string; mime?: string }) {
    const transcript = await this.transcribeAudio(input.audioBase64 ?? '', input.mime ?? '');
    const fields = await this.parseIntake(transcript);
    return { transcript, fields };
  }

  async parseIntake(transcript: string) {
    const material = transcript.trim();
    if (!material) throw new BadRequestException('没有识别到语音内容');
    if (!this.client.enabled) throw new BadRequestException('未配置 LLM_API_KEY（通义百炼），无法解析录音');
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.client.chatJson<Record<string, unknown>>([
        { role: 'system', content: INTAKE_PARSE_SYSTEM },
        {
          role: 'user',
          content: `口述：\n${material.slice(0, 8000)}\n\n按系统说明输出 JSON。`,
        },
      ], { temperature: 0.1 });
    } catch (error) {
      this.logger.warn(`主诉解析失败: ${String(error).slice(0, 300)}`);
      throw new BadRequestException('录音已识别，但整理成病历字段失败，请稍后重试或手工填写');
    }
    return normalizeIntake(parsed);
  }

  /** 按页签从文字里摘字段。没提到的留空，不推测。 */
  async extractSection(input: { text?: string; section?: string }) {
    const text = (input.text ?? '').trim();
    if (!text) throw new BadRequestException('没有可解析的内容');
    if (!this.client.enabled) throw new BadRequestException('未配置 LLM_API_KEY（通义百炼），无法解析');
    const section = input.section === 'condition' || input.section === 'plan' ? input.section : 'chart';
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.client.chatJson<Record<string, unknown>>([
        { role: 'system', content: EXTRACT_SYSTEM[section] },
        { role: 'user', content: `材料：\n${text.slice(0, 8000)}` },
      ], { temperature: 0.1 });
    } catch (error) {
      this.logger.warn(`页签解析失败: ${String(error).slice(0, 300)}`);
      throw new BadRequestException('解析暂时不可用，请稍后重试或手工填写');
    }
    const fields = Object.fromEntries(
      EXTRACT_KEYS[section].map((key) => [key, typeof parsed[key] === 'string' ? parsed[key].trim() : '']),
    );
    return { section, fields };
  }

  /** 对照上次已确认记录，只返回本次材料里写明的变化。 */
  async compareVisit(input: { previous?: string; current?: string }) {
    const current = (input.current ?? '').trim();
    if (!current) throw new BadRequestException('请先填写本次情况');
    if (!this.client.enabled) throw new BadRequestException('未配置 LLM_API_KEY（通义百炼），无法对比');
    const previous = (input.previous ?? '').trim() || '（没有上次记录）';
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.client.chatJson<Record<string, unknown>>([
        { role: 'system', content: COMPARE_SYSTEM },
        { role: 'user', content: `上次：\n${previous.slice(0, 4000)}\n\n本次：\n${current.slice(0, 4000)}` },
      ], { temperature: 0.1 });
    } catch (error) {
      this.logger.warn(`病情对比失败: ${String(error).slice(0, 300)}`);
      throw new BadRequestException('对比暂时不可用，请稍后重试或手工记录变化');
    }
    return {
      improved: textList(parsed.improved),
      worsened: textList(parsed.worsened),
      added: textList(parsed.added),
      resolved: textList(parsed.resolved),
      unchanged: textList(parsed.unchanged),
    };
  }

  /** 按本次材料生成摘要，医生可改后再写入档案。 */
  async summarizeVisit(input: { previous?: string; current?: string }) {
    const current = (input.current ?? '').trim();
    if (!current) throw new BadRequestException('请先填写本次情况');
    if (!this.client.enabled) throw new BadRequestException('未配置 LLM_API_KEY（通义百炼），无法生成摘要');
    const previous = (input.previous ?? '').trim();
    let parsed: Record<string, unknown>;
    try {
      parsed = await this.client.chatJson<Record<string, unknown>>([
        { role: 'system', content: SUMMARY_SYSTEM },
        {
          role: 'user',
          content: `${previous ? `上次：\n${previous.slice(0, 3000)}\n\n` : ''}本次：\n${current.slice(0, 4000)}`,
        },
      ], { temperature: 0.2 });
    } catch (error) {
      this.logger.warn(`病情摘要失败: ${String(error).slice(0, 300)}`);
      throw new BadRequestException('摘要暂时不可用，请手工填写');
    }
    const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
    if (!summary) throw new BadRequestException('没有生成摘要，请手工填写');
    return { summary };
  }

  private async transcribeAudio(audioBase64: string, mime: string): Promise<string> {
    const payload = audioBase64.replace(/^data:[^,]*,/, '').replace(/\s/g, '');
    if (!payload) throw new BadRequestException('没有录音内容');
    let bytes = 0;
    try {
      bytes = Buffer.from(payload, 'base64').byteLength;
    } catch {
      throw new BadRequestException('录音内容无法读取');
    }
    if (!bytes) throw new BadRequestException('没有录音内容');
    if (bytes > 8 * 1024 * 1024) throw new BadRequestException('录音文件请控制在 8MB 以内');
    const format = audioFormat(mime);
    const key = process.env.ASR_API_KEY || process.env.LLM_API_KEY || process.env.QWEN_API_KEY || process.env.DEEPSEEK_API_KEY || '';
    if (!key) throw new BadRequestException('未配置语音识别密钥，暂不能识别录音');
    const base = (
      process.env.ASR_BASE_URL ||
      process.env.LLM_BASE_URL ||
      process.env.QWEN_BASE_URL ||
      'https://dashscope.aliyuncs.com/compatible-mode/v1'
    ).replace(/\/+$/, '');
    const model = asrModel();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [{
            role: 'user',
            content: [{ type: 'input_audio', input_audio: { data: payload, format } }],
          }],
          stream: false,
          asr_options: { language: 'zh', enable_itn: false },
        }),
      });
      const raw = await response.text();
      if (!response.ok) {
        this.logger.warn(`语音识别失败 ${response.status}: ${raw.slice(0, 300)}`);
        throw new BadRequestException(asrErrorMessage(raw));
      }
      const transcript = messageText(safeJson(raw)).trim();
      if (!transcript) throw new BadRequestException('没有识别到语音内容');
      return transcript;
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      this.logger.warn(`语音识别请求失败: ${String(error).slice(0, 300)}`);
      throw new BadRequestException('语音识别暂时不可用，请稍后重试或改为文字填写');
    } finally {
      clearTimeout(timer);
    }
  }
}

const COMPARE_SYSTEM = `你对照上次病情和本次口述，只摘本次明确说到的变化。
规则：
1. 只根据【本次】里写明的内容判断，没提到的不要填；
2. improved 是好转，worsened 是加重，added 是新增，resolved 是消失，unchanged 是无明显变化；
3. 每类是字符串数组，没有就给空数组；
4. 禁止推测、补充或编造；
5. 只输出 JSON 对象。`;

const SUMMARY_SYSTEM = `你根据本次就诊材料写一段病情摘要，供医生修改。
规则：
1. 只写材料里有的内容，不补充、不推测；
2. 用一段中文，不要编号；
3. 只输出 JSON：{"summary":"..."}。`;

const EXTRACT_KEYS = {
  chart: ['chiefComplaint', 'presentIllness'],
  condition: ['symptoms', 'tongue', 'pulse'],
  plan: ['westernDiagnosis', 'tcmDisease', 'tcmSyndrome', 'principle', 'acupoints', 'prescriptions', 'lifestyle'],
} as const;

const EXTRACT_SYSTEM = {
  chart: `从材料里摘主诉和现病史。只写材料里明确说到的内容，没提到的用空字符串。不要补充、推测。只输出 JSON：{"chiefComplaint":"","presentIllness":""}。`,
  condition: `从材料里摘目前症状、舌象、脉象。只写材料里明确说到的内容，没提到的用空字符串。不要补充、推测。只输出 JSON：{"symptoms":"","tongue":"","pulse":""}。`,
  plan: `从材料里摘诊断和治疗方案。只写材料里明确说到的内容，没提到的用空字符串。不要补充、推测。只输出 JSON：{"westernDiagnosis":"","tcmDisease":"","tcmSyndrome":"","principle":"","acupoints":"","prescriptions":"","lifestyle":""}。`,
} as const;

const INTAKE_PARSE_SYSTEM = `你是病案整理助手。把医生口述拆成门诊主诉字段。
规则：
1. 只摘口述里明确说到的内容，没提到的字段用空字符串，禁止补充、推测或编造；
2. 只输出 JSON 对象，键为：chiefComplaint,presentIllness,menstrualHistory,dailyCondition,tongue,pulse,signs,westernDiagnosis,tcmDisease,tcmSyndrome。不要输出既往史、家族史、过敏史、用药史、手术史，也不要输出检验、检查资料。`;

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
}

function asrModel(): string {
  const configured = (process.env.ASR_MODEL ?? '').trim();
  if (configured && !/^paraformer-v2$/i.test(configured)) return configured;
  return 'qwen3-asr-flash';
}

function audioFormat(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  const table: Record<string, string> = {
    'audio/webm': 'webm',
    'video/webm': 'webm',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/wave': 'wav',
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/mp4': 'm4a',
    'audio/m4a': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/aac': 'aac',
    'audio/ogg': 'ogg',
  };
  const format = table[normalized];
  if (!format) throw new BadRequestException('请上传 webm、wav、mp3、m4a 或 ogg 录音');
  return format;
}

function safeJson(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function messageText(data: Record<string, unknown>): string {
  const choices = data.choices;
  const first = Array.isArray(choices) ? choices[0] as Record<string, unknown> | undefined : undefined;
  const message = first?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part) return String((part as { text?: unknown }).text ?? '');
      return '';
    }).join('');
  }
  return '';
}

function asrErrorMessage(raw: string): string {
  const data = safeJson(raw);
  const error = data.error as Record<string, unknown> | undefined;
  const message = typeof error?.message === 'string' ? error.message : '';
  if (/api.key|invalid.*key|unauthorized/i.test(message)) return '语音识别密钥无效，请检查 ASR_API_KEY 或 LLM_API_KEY';
  if (/model/i.test(message)) return '当前语音识别模型不可用，请确认已开通 qwen3-asr-flash';
  return '语音识别失败，请稍后重试或改为文字填写';
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIntake(parsed: Record<string, unknown>) {
  return {
    chiefComplaint: cleanText(parsed.chiefComplaint),
    presentIllness: cleanText(parsed.presentIllness),
    menstrualHistory: cleanText(parsed.menstrualHistory),
    dailyCondition: cleanText(parsed.dailyCondition),
    tongue: cleanText(parsed.tongue),
    pulse: cleanText(parsed.pulse),
    signs: cleanText(parsed.signs),
    westernDiagnosis: cleanText(parsed.westernDiagnosis),
    tcmDisease: cleanText(parsed.tcmDisease),
    tcmSyndrome: cleanText(parsed.tcmSyndrome),
  };
}
