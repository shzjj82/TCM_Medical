import { Injectable, Logger } from '@nestjs/common';
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
}
