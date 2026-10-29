import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseDiagnosis, CaseExam, CaseHistory } from '../../entities/case-clinical.entity';
import { CaseRecord } from '../../entities/case-record.entity';
import { InternalProtocol } from '../../entities/internal-protocol.entity';
import { Patient } from '../../entities/patient.entity';
import { Visit } from '../../entities/visit.entity';
import { isUuid, normalizeDate, pick, toArray } from '../../common/payload';

/** 疗效判定口径，与 skills/tcm-medical-case/lib_case.py 的 _verdict 保持一致。 */
function verdictOf(initial?: number, latest?: number): { verdict: string; improvementRate?: number; severityDelta?: number } {
  if (initial === undefined || latest === undefined || initial <= 0) return { verdict: '待评估' };
  const severityDelta = latest - initial;
  const improvementRate = (initial - latest) / initial;
  let verdict: string;
  if (latest <= 1) verdict = '临床痊愈';
  else if (improvementRate >= 0.7) verdict = '显效';
  else if (improvementRate >= 0.3) verdict = '有效';
  else if (improvementRate > 0) verdict = '好转';
  else if (severityDelta === 0) verdict = '无变化';
  else verdict = '加重';
  return { verdict, improvementRate, severityDelta };
}

/** 是否存在至少一条就诊方案：档案 treatmentPlan（治则/取穴/方剂/调摄任一）或治疗记录 AI 解析出的方案。 */
export function hasTreatmentPlan(record: CaseRecord, visits: Visit[]): boolean {
  const plan = (record.treatmentPlan ?? {}) as Record<string, any>;
  const direct = [
    plan.principle,
    ...(Array.isArray(plan.acupoints) ? plan.acupoints : []),
    ...(Array.isArray(plan.prescriptions) ? plan.prescriptions : []),
    ...(Array.isArray(plan.lifestyle) ? plan.lifestyle : []),
  ].some((v) => String(v ?? '').trim().length > 0);
  if (direct) return true;
  return visits.some((v) => {
    const parsed = (v.parsed ?? {}) as Record<string, any>;
    const principle = pick<string>(parsed, ['treatment_principle', 'treatmentPrinciple']);
    return (
      String(principle ?? '').trim().length > 0 ||
      toArray(pick(parsed, ['acupoints'])).length > 0 ||
      toArray(pick(parsed, ['prescriptions'])).length > 0
    );
  });
}

function textOf(source: Record<string, any> | undefined, keys: string[]): string | undefined {
  const value = source ? pick<string>(source, keys) : undefined;
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

function objectOf(source: Record<string, any>, keys: string[]): Record<string, any> | undefined {
  for (const key of keys) {
    const value = source?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  }
  return undefined;
}

function severityOf(visit: Visit): number | undefined {
  const raw = (visit.outcome ?? {}) as Record<string, any>;
  const value = raw.severity_score ?? raw.severityScore;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
}

type VisitKind = 'first' | 'return' | 'close' | 'refer' | 'follow';

function kindOf(visit: { kind?: string | null; visitNo?: number }): VisitKind {
  if (visit.kind === 'first' || visit.kind === 'return' || visit.kind === 'close' || visit.kind === 'refer' || visit.kind === 'follow') {
    return visit.kind;
  }
  return (visit.visitNo ?? 1) <= 1 ? 'first' : 'return';
}

function isTreatment(kind: VisitKind): boolean {
  return kind === 'first' || kind === 'return';
}

function normalizeKind(value: unknown): VisitKind {
  return value === 'first' || value === 'return' || value === 'close' || value === 'refer' || value === 'follow' ? value : 'return';
}

function assertCourse(prior: Visit[], kind: VisitKind) {
  const kinds = prior.map((item) => kindOf(item));
  if (kinds.includes('close')) throw new BadRequestException('档案已结案，不能再添加记录');
  if (kinds.includes('refer')) throw new BadRequestException('档案已转诊，不能再添加记录');
  const hasFirst = kinds.includes('first');
  const hasReturn = kinds.includes('return');
  if (kind === 'first') {
    if (hasFirst) throw new BadRequestException('已有初诊，请添加复诊');
    return;
  }
  if (!hasFirst) throw new BadRequestException('请先完成初诊');
  if ((kind === 'close' || kind === 'refer') && !hasReturn) {
    throw new BadRequestException('请先记录复诊，再结案或转诊');
  }
}

/** 由档案 + 治疗记录计算「期初 → N 次治疗 → 末期」对比，前端只读不算。 */
export function buildContrast(caseRecord: CaseRecord, visits: Visit[]): Record<string, unknown> {
  const ordered = [...visits].sort((a, b) => a.visitNo - b.visitNo);
  const treatment = ordered.filter((visit) => isTreatment(kindOf(visit)));
  const initial = {
    date: normalizeDate(caseRecord.createdAt) ?? new Date().toISOString().slice(0, 10),
    summary: [caseRecord.chiefComplaint, caseRecord.presentIllness].filter(Boolean).join('；') || '（未记录）',
    severity_score: caseRecord.severityScore,
  };
  const latestVisit = treatment[treatment.length - 1];
  const latestSeverity = latestVisit ? severityOf(latestVisit) : undefined;
  const latest = latestVisit
    ? {
        date: latestVisit.date,
        summary:
          String(pick(latestVisit.outcome ?? {}, ['doctor_conclusion', 'doctorConclusion']) ?? '') ||
          String(pick(latestVisit.parsed ?? {}, ['narrative']) ?? '') ||
          latestVisit.doctorNote ||
          '（未记录）',
        severity_score: latestSeverity,
      }
    : undefined;

  const acupunctureTimes = treatment.filter((v) => toArray(pick(v.parsed ?? {}, ['acupoints'])).length > 0).length;
  const herbalTimes = treatment.filter((v) => toArray(pick(v.parsed ?? {}, ['prescriptions'])).length > 0).length;
  const treatments = [
    acupunctureTimes ? `针灸 ${acupunctureTimes} 次` : '',
    herbalTimes ? `中药 ${herbalTimes} 诊` : '',
  ].filter(Boolean);

  const { verdict, improvementRate, severityDelta } = verdictOf(caseRecord.severityScore, latestSeverity);

  // 关键转折：严重度发生变化的诊次
  const milestones: Array<Record<string, unknown>> = [];
  let prev = caseRecord.severityScore;
  for (const visit of treatment) {
    const current = severityOf(visit);
    if (current !== undefined && prev !== undefined && current !== prev) {
      milestones.push({
        visit_no: visit.visitNo,
        date: visit.date,
        key_change: `严重度 ${prev} → ${current}`,
      });
    }
    if (current !== undefined) prev = current;
  }

  return {
    initial,
    visits_done: treatment.length,
    treatments,
    latest,
    delta: { severity_delta: severityDelta, improvement_rate: improvementRate, verdict },
    milestones,
  };
}

@Injectable()
export class CasesService {
  constructor(
    @InjectRepository(CaseRecord) private readonly repo: Repository<CaseRecord>,
    @InjectRepository(CaseDiagnosis) private readonly diagnoses: Repository<CaseDiagnosis>,
    @InjectRepository(Visit) private readonly visits: Repository<Visit>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(InternalProtocol) private readonly protocols: Repository<InternalProtocol>,
  ) {}

  private withClinical<T extends { leftJoinAndMapOne: Function; leftJoinAndMapMany: Function; addOrderBy: Function }>(qb: T): T {
    return qb
      .leftJoinAndMapOne('c.history', CaseHistory, 'history', 'history.caseId = c.id')
      .leftJoinAndMapOne('c.diagnosis', CaseDiagnosis, 'diagnosis', 'diagnosis.caseId = c.id')
      .leftJoinAndMapMany('c.exams', CaseExam, 'exam', 'exam.caseId = c.id')
      .addOrderBy('exam.sortOrder', 'ASC') as T;
  }

  /** uuid / externalId 安全的病患查找（同 patients.service 的占位符约束）。 */
  private async findPatient(key: string): Promise<Patient> {
    const qb = this.patients.createQueryBuilder('p');
    if (isUuid(key)) {
      qb.where('p.id = :uuidKey', { uuidKey: key })
        .orWhere('p.externalId = :key', { key })
        .orWhere('p.name = :key', { key });
    } else {
      qb.where('p.externalId = :key OR p.name = :key', { key });
    }
    const found = await qb.getOne();
    if (!found) throw new NotFoundException(`病人不存在: ${key}`);
    return found;
  }

  async findOne(key: string): Promise<CaseRecord> {
    const qb = this.repo.createQueryBuilder('c');
    if (isUuid(key)) {
      qb.where('c.id = :uuidKey', { uuidKey: key }).orWhere('c.externalId = :key', { key });
    } else {
      qb.where('c.externalId = :key', { key });
    }
    const found = await this.withClinical(qb).getOne();
    if (!found) throw new NotFoundException(`就诊档案不存在: ${key}`);
    return found;
  }

  /** 病患的全部档案，治疗中优先、其余按更新时间倒序。 */
  async listByPatient(patientKey: string): Promise<CaseRecord[]> {
    const patient = await this.findPatient(patientKey);
    return this.withClinical(
      this.repo
        .createQueryBuilder('c')
        .where('c.patientId = :pid', { pid: patient.id })
        .orderBy(`CASE WHEN c.status = 'active' THEN 0 ELSE 1 END`, 'ASC')
        .addOrderBy('c.updatedAt', 'DESC'),
    ).getMany();
  }

  /** 全部已归档档案（内部知识库数据源），带出病患信息，按归档时间倒序。 */
  async listArchived(limit = 200): Promise<CaseRecord[]> {
    return this.repo
      .createQueryBuilder('c')
      .leftJoinAndSelect('c.patient', 'p')
      .where('c.status = :status', { status: 'archived' })
      .orderBy('c.archivedAt', 'DESC')
      .take(limit)
      .getMany();
  }

  /** 批量取「每个病患最近一次档案」（活跃优先），供病患列表展示多次治疗结果。 */
  async latestByPatients(patientIds: string[]): Promise<Map<string, CaseRecord>> {
    const map = new Map<string, CaseRecord>();
    if (!patientIds.length) return map;
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c.patientId IN (:...ids)', { ids: patientIds })
      .orderBy('c.caseNo', 'ASC')
      .addOrderBy('c.createdAt', 'ASC')
      .getMany();
    for (const row of rows) {
      if (row.patientId && !map.has(row.patientId)) map.set(row.patientId, row);
    }
    return map;
  }

  /** 新建档案（疾病信息）。 */
  async create(payload: Record<string, any>): Promise<CaseRecord> {
    const patientKey = pick<string>(payload, ['patientId', 'patientKey', 'patient']);
    if (!patientKey) throw new BadRequestException('缺少 patientId');
    const patient = await this.findPatient(patientKey);

    const chiefComplaint = textOf(payload, ['chiefComplaint', 'chief_complaint']);
    if (!chiefComplaint) throw new BadRequestException('主诉为必填项');
    const presentIllness = textOf(payload, ['presentIllness', 'present_illness']);
    if (!presentIllness) throw new BadRequestException('现病史为必填项');

    const diagnosisInput = objectOf(payload, ['diagnosis']);
    const diagnosis = {
      westernDiagnosis: textOf(diagnosisInput, ['westernDiagnosis', 'western_diagnosis']) ?? textOf(payload, ['westernDiagnosis', 'western_diagnosis']),
      tcmDisease: textOf(diagnosisInput, ['tcmDisease', 'tcm_disease']) ?? textOf(payload, ['tcmDisease', 'tcm_disease']),
      tcmSyndrome: textOf(diagnosisInput, ['tcmSyndrome', 'tcm_syndrome']) ?? textOf(payload, ['tcmSyndrome', 'tcm_syndrome']),
    };

    const count = await this.repo.count({ where: { patientId: patient.id } });
    if (count > 0) throw new BadRequestException('该患者已有疾病，不能再新建一份');
    const entity = this.repo.create({
      patient,
      patientId: patient.id,
      caseNo: count + 1,
      chiefComplaint,
      presentIllness,
      menstrualHistory: textOf(payload, ['menstrualHistory', 'menstrual_history']),
      dailyCondition: textOf(payload, ['dailyCondition', 'daily_condition']),
      signs: textOf(payload, ['signs', 'physicalSigns', 'physical_signs']),
      tcmDisease: diagnosis.tcmDisease,
      tcmSyndrome: diagnosis.tcmSyndrome,
      symptoms: toArray(pick(payload, ['symptoms'])),
      tongue: textOf(payload, ['tongue']),
      pulse: textOf(payload, ['pulse']),
      severityScore: (() => {
        const raw = pick(payload, ['severityScore', 'severity_score']);
        const num = Number(raw);
        return Number.isFinite(num) ? Math.max(0, Math.min(10, num)) : undefined;
      })(),
      treatmentPlan: pick(payload, ['treatmentPlan', 'treatment_plan']) ?? undefined,
      status: 'active',
      visitCount: 0,
    });
    const saved = await this.repo.save(entity);
    if (Object.values(diagnosis).some(Boolean)) {
      await this.diagnoses.save(this.diagnoses.create({ caseId: saved.id, ...diagnosis }));
    }
    const first = objectOf(payload, ['firstVisit', 'first_visit']) ?? {};
    const material = textOf(first, ['text', 'material']) || [chiefComplaint, textOf(payload, ['presentIllness', 'present_illness'])].filter(Boolean).join('\n');
    const plan = objectOf(payload, ['treatmentPlan', 'treatment_plan']) ?? {};
    await this.addVisit(saved.id, {
      text: material,
      doctorNote: textOf(first, ['doctorNote', 'doctor_note', 'reasoning']) || textOf(payload, ['reasoning']),
      media: Array.isArray(first.media) ? first.media : [],
      channels: Array.isArray(first.channels) ? first.channels : [],
      reviewStatus: first.reviewStatus === 'confirmed' ? 'confirmed' : 'pending',
      aiMode: Array.isArray(first.channels) && first.channels.includes('audio') ? 'llm' : 'manual',
      kind: 'first',
      chiefComplaint,
      presentIllness,
      diagnosis: {
        ...diagnosis,
        principle: typeof plan.principle === 'string' ? plan.principle : undefined,
        acupoints: plan.acupoints,
        prescriptions: plan.prescriptions,
        lifestyle: plan.lifestyle,
      },
      parsed: {
        chiefComplaint,
        presentIllness,
        tongue: saved.tongue,
        pulse: saved.pulse,
        signs: saved.signs,
        symptoms: saved.symptoms,
        tcmDisease: diagnosis.tcmDisease,
        tcmSyndrome: diagnosis.tcmSyndrome,
      },
      keepSummary: first.keepSummary !== false,
    });
    return this.findOne(saved.id);
  }

  /** 更新档案基础信息（仅治疗中可改；归档后只读）。 */
  async update(key: string, payload: Record<string, any>): Promise<CaseRecord> {
    const record = await this.findOne(key);
    if (record.status === 'archived') throw new BadRequestException('档案已归档，内容只读');
    const assign = (field: keyof CaseRecord, names: string[]) => {
      const value = pick(payload, names);
      if (value !== undefined) (record as any)[field] = value;
    };
    assign('chiefComplaint', ['chiefComplaint', 'chief_complaint']);
    assign('presentIllness', ['presentIllness', 'present_illness']);
    assign('tcmDisease', ['tcmDisease', 'tcm_disease']);
    assign('tcmSyndrome', ['tcmSyndrome', 'tcm_syndrome']);
    assign('tongue', ['tongue']);
    assign('pulse', ['pulse']);
    const symptoms = pick(payload, ['symptoms']);
    if (symptoms !== undefined) record.symptoms = toArray(symptoms);
    const plan = pick(payload, ['treatmentPlan', 'treatment_plan']);
    if (plan !== undefined) record.treatmentPlan = plan;
    return this.repo.save(record);
  }

  /**
   * 多次治疗：向活跃档案追加一条治疗记录，并重算 contrast 与 latestSummary。
   * AI 解析由调用方（前端预览后提交 / 后续 ASR 管线）提供 parsed，这里不重复推理。
   */
  async addVisit(caseKey: string, payload: Record<string, any>): Promise<Visit> {
    const record = await this.findOne(caseKey);
    if (record.status === 'archived' || record.courseEnd === 'closed') throw new BadRequestException('档案已结案，不能继续添加记录');
    if (record.courseEnd === 'referred') throw new BadRequestException('档案已转诊，不能继续添加记录');

    const text = pick<string>(payload, ['text']);
    const doctorNote = pick<string>(payload, ['doctorNote', 'doctor_note']);
    const parsed = pick(payload, ['parsed']);
    if (!text && !doctorNote && !parsed) throw new BadRequestException('至少提供现场记录、医生批注或解析结果之一');

    const prior = await this.visits
      .createQueryBuilder('v')
      .where('v.caseId = :cid', { cid: record.id })
      .orderBy('v.visitNo', 'ASC')
      .getMany();
    const kind = normalizeKind(payload.kind);
    assertCourse(prior, kind);
    if (kind === 'close' && !hasTreatmentPlan(record, prior)) {
      throw new BadRequestException('结案前需至少填写一条就诊方案（治则、取穴、方剂或调摄）');
    }

    const severityRaw = pick(payload, ['severity', 'severityScore', 'severity_score']);
    const severity = Number(severityRaw);
    const channels = new Set<string>();
    if (doctorNote) channels.add('doctor_note');
    if (text) channels.add('text');
    const extraChannels = pick(payload, ['channels']);
    if (Array.isArray(extraChannels)) extraChannels.forEach((item) => { if (item) channels.add(String(item)); });
    const media = Array.isArray(payload.media) ? payload.media : toArray(pick(payload, ['media']));
    const visitNo = prior.reduce((max, item) => Math.max(max, item.visitNo || 0), 0) + 1;

    const visit = this.visits.create({
      patient: record.patient,
      patientId: record.patientId,
      caseRecord: record,
      caseId: record.id,
      visitNo,
      kind,
      chiefComplaint: textOf(payload, ['chiefComplaint', 'chief_complaint']),
      presentIllness: textOf(payload, ['presentIllness', 'present_illness']),
      diagnosis: objectOf(payload, ['diagnosis']) ?? undefined,
      date: normalizeDate(pick(payload, ['date', 'visitDate', 'visit_date'])) ?? new Date().toISOString().slice(0, 10),
      channels: channels.size ? [...channels] : ['text'],
      raw: { material: text ?? '', media },
      doctorNote: doctorNote || undefined,
      parsed: parsed ?? {},
      outcome: {
        ...(pick(payload, ['outcome']) ?? {}),
        ...(Number.isFinite(severity) ? { severity_score: Math.max(0, Math.min(10, severity)) } : {}),
        next_plan: pick<string>(payload, ['nextPlan', 'next_plan']) ?? undefined,
      },
      aiMode: parsed ? pick<string>(payload, ['aiMode', 'ai_mode']) ?? 'llm' : 'manual',
      reviewStatus: payload.reviewStatus === 'confirmed' ? 'confirmed' : 'pending',
    });
    const saved = await this.visits.save(visit);

    const all = await this.listVisits(record.id);
    record.visitCount = all.filter((item) => isTreatment(kindOf(item))).length;
    record.contrast = buildContrast(record, all);
    const summary = textOf(payload, ['summary', 'latestSummary', 'latest_summary']);
    if (summary) record.latestSummary = summary;
    else if (kind === 'close' && doctorNote) record.latestSummary = doctorNote;
    else if (!payload.keepSummary && isTreatment(kind)) {
      record.latestSummary = String(
        pick(saved.outcome ?? {}, ['doctor_conclusion', 'doctorConclusion']) ??
        pick(saved.parsed ?? {}, ['narrative']) ??
        saved.doctorNote ?? '',
      ) || record.latestSummary;
    }
    if (kind === 'refer') record.courseEnd = 'referred';
    if (kind === 'close') record.courseEnd = 'closed';
    await this.repo.save(record);
    if (kind === 'close') await this.archive(record.id);
    return saved;
  }

  async listVisits(caseKey: string): Promise<Visit[]> {
    const record = await this.findOne(caseKey);
    return this.visits
      .createQueryBuilder('v')
      .where('v.caseId = :cid', { cid: record.id })
      .orderBy('v.visitNo', 'ASC')
      .getMany();
  }

  /**
   * 归档：档案置为只读，固化快照（带出病患信息），并写入内部知识库。
   * 幂等：已归档则直接返回现有记录。
   */
  async archive(caseKey: string): Promise<CaseRecord> {
    const record = await this.findOne(caseKey);
    if (record.status === 'archived') return record;
    if (!record.patientId) throw new BadRequestException('档案缺少关联病患，无法归档');
    const patient = await this.patients.findOne({ where: { id: record.patientId } });
    const visits = await this.listVisits(record.id);
    // 归档硬性要求：至少一条就诊方案（治则治法 / 取穴 / 方剂 / 调摄），否则拒绝
    if (!hasTreatmentPlan(record, visits)) {
      throw new BadRequestException('归档前需至少填写一条就诊方案（治则治法 / 取穴 / 方剂 / 调摄），可在「就诊方案」中补充或通过治疗记录的 AI 解析生成');
    }
    const contrast = buildContrast(record, visits);

    record.status = 'archived';
    record.courseEnd = record.courseEnd ?? 'closed';
    record.archivedAt = new Date();
    record.contrast = contrast;
    record.archiveSnapshot = {
      patient: patient
        ? { name: patient.name, gender: patient.gender, age: patient.age, externalId: patient.externalId }
        : undefined,
      case: {
        caseNo: record.caseNo,
        chiefComplaint: record.chiefComplaint,
        presentIllness: record.presentIllness,
        menstrualHistory: record.menstrualHistory,
        dailyCondition: record.dailyCondition,
        signs: record.signs,
        tongue: record.tongue,
        pulse: record.pulse,
        history: record.history,
        diagnosis: record.diagnosis,
        exams: record.exams,
        tcmDisease: record.tcmDisease,
        tcmSyndrome: record.tcmSyndrome,
        symptoms: record.symptoms,
        treatmentPlan: record.treatmentPlan,
      },
      contrast,
      visits: visits.map((v) => ({
        visitNo: v.visitNo,
        kind: kindOf(v),
        date: v.date,
        doctorNote: v.doctorNote,
        parsed: v.parsed,
        outcome: v.outcome,
      })),
    };
    const saved = await this.repo.save(record);

    const delta = (contrast.delta ?? {}) as Record<string, any>;
    const improvement = typeof delta.improvement_rate === 'number' ? delta.improvement_rate : 0;
    const externalId = `CASE-${record.externalId ?? record.id}`;
    const title = `${record.tcmDisease ?? '未命名病'}·${record.tcmSyndrome ?? '未辨证'}（${patient?.name ?? '未知病患'}）`;
    let protocol = await this.protocols.findOne({ where: { externalId } });
    protocol = protocol ?? this.protocols.create({ externalId });
    protocol.title = title;
    protocol.tcmDisease = record.tcmDisease;
    protocol.tcmSyndrome = record.tcmSyndrome;
    protocol.patientCount = 1;
    protocol.visitCount = visits.filter((item) => isTreatment(kindOf(item))).length;
    protocol.effectiveRate = improvement;
    protocol.payload = { source: 'archive', caseId: record.id, verdict: delta.verdict, snapshot: record.archiveSnapshot };
    await this.protocols.save(protocol);
    return saved;
  }
}
