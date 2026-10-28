export type ReviewStatus = 'pending' | 'confirmed' | 'rejected';

export interface Condition {
  date?: string;
  chief_complaint?: string;
  chiefComplaint?: string;
  western_diagnosis?: string[];
  westernDiagnosis?: string[];
  tcm_disease?: string;
  tcmDisease?: string;
  tcm_syndrome?: string;
  tcmSyndrome?: string;
  symptoms?: string[];
  tongue?: string;
  pulse?: string;
  severity_score?: number;
  severityScore?: number;
  summary?: string;
  attachments?: string[];
  amendments?: Array<{ at: string; field?: string; note: string }>;
}

export interface ContrastDelta {
  severity_delta?: number;
  severityDelta?: number;
  improvement_rate?: number;
  improvementRate?: number;
  verdict?: string;
}

export interface Contrast {
  initial?: { date?: string; summary?: string; severity_score?: number; severityScore?: number };
  visits_done?: number;
  visitsDone?: number;
  treatments?: string[];
  latest?: { date?: string; summary?: string; severity_score?: number; severityScore?: number };
  delta?: ContrastDelta;
  milestones?: Array<{ visit_no?: number; visitNo?: number; date?: string; key_change?: string; keyChange?: string }>;
}

export interface Visit {
  id: string;
  externalId?: string;
  caseId?: string;
  visitNo: number;
  date: string;
  channels: string[];
  doctorNote?: string;
  aiMode?: string;
  reviewStatus: ReviewStatus;
  parsed?: Record<string, any>;
  outcome?: Record<string, any>;
  raw?: Record<string, any>;
}

/** 就诊方案（纯中医）：治则治法 + 取穴 + 方剂 + 调摄。 */
export interface TreatmentPlan {
  principle?: string;
  acupoints?: string[];
  prescriptions?: string[];
  lifestyle?: string[];
}

/** 就诊档案（疾病信息）：一个病患可有多份，归档后只读并沉淀内部知识库。 */
export interface CaseRecord {
  id: string;
  externalId?: string;
  patientId?: string;
  caseNo: number;
  chiefComplaint: string;
  presentIllness?: string;
  tcmDisease?: string;
  tcmSyndrome?: string;
  symptoms: string[];
  tongue?: string;
  pulse?: string;
  severityScore?: number;
  treatmentPlan?: TreatmentPlan;
  status: 'active' | 'archived';
  visitCount: number;
  contrast?: Contrast;
  latestSummary?: string;
  archivedAt?: string;
  archiveSnapshot?: Record<string, any>;
  updatedAt?: string;
  createdAt?: string;
  visits?: Visit[];
  /** 归档列表接口（leftJoin）带出的病患信息摘要。 */
  patient?: { id: string; externalId?: string; name: string; gender?: string; age?: number };
}

export interface Patient {
  id: string;
  externalId?: string;
  name: string;
  gender?: string;
  age?: number;
  phone?: string;
  doctor?: string;
  tags: string[];
  status: 'active' | 'paused' | 'closed';
  visitCount: number;
  initialCondition?: Condition;
  currentCondition?: Condition;
  contrast?: Contrast;
  latestSummary?: string;
  updatedAt?: string;
  visits?: Visit[];
  /** 该病患的全部就诊档案（详情接口返回）。 */
  cases?: CaseRecord[];
  /** 最近一次档案（活跃优先），列表接口返回，用于展示多次治疗结果。 */
  latestCase?: CaseRecord;
}

export interface KnowledgeRow {
  id: string;
  title: string;
  score?: number;
  payload: Record<string, any>;
}

export interface AdvisePlanPoint {
  point?: string;
  manipulation?: string;
  retentionMin?: number;
  retention_min?: number;
  rationale?: string;
  source?: string;
}

export interface AdviseResult {
  mode: 'llm' | 'rule_based' | 'rule_based_fallback';
  safetyAlerts: string[];
  plan?: {
    caseProfile?: Record<string, unknown>;
    treatmentPrinciple?: string;
    acupuncturePlan?: AdvisePlanPoint[];
    herbalPlan?: Array<{ formula?: string; modification?: string; source?: string; note?: string }>;
    lifestyleAdvice?: string[];
    followupPlan?: string;
    confidence?: number;
  };
  external: Record<string, any>[];
  internal: Record<string, any>[];
  cases: Record<string, any>[];
  disclaimer: string;
}

export interface SkillSummary {
  id: string;
  name: string;
  keywords: string[];
  negativeKeywords: string[];
  intents: Array<{ intent: string; when: string; command: string }>;
  tools: Array<{ name: string; description: string }>;
}
