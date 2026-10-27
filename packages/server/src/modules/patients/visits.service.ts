import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CaseRecord } from '../../entities/case-record.entity';
import { Patient } from '../../entities/patient.entity';
import { Visit } from '../../entities/visit.entity';
import { isUuid, normalizeDate, pick, toArray } from '../../common/payload';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(Visit) private readonly repo: Repository<Visit>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
    @InjectRepository(CaseRecord) private readonly cases: Repository<CaseRecord>,
  ) {}

  async listForPatient(patientKey: string): Promise<Visit[]> {
    // 与 patients.service 保持一致：uuid 列只在 key 是合法 uuid 时才参与比较，
    // 否则用姓名或 P-2026-001 这类外部 ID 查询会让 PostgreSQL 抛类型错误。
    const pqb = this.patients.createQueryBuilder('p');
    if (isUuid(patientKey)) {
      // 同 patients.service：uuid 列与 varchar 列要用独立占位符，
      // 否则 PG 把参数推断成 uuid 后，external_id/name 的比较会报类型不匹配。
      pqb.where('p.id = :uuidKey', { uuidKey: patientKey })
        .orWhere('p.externalId = :key', { key: patientKey })
        .orWhere('p.name = :key', { key: patientKey });
    } else {
      pqb.where('p.externalId = :key OR p.name = :key', { key: patientKey });
    }
    const patient = await pqb.getOne();
    const qb = this.repo.createQueryBuilder('v');
    if (patient) qb.where('v.patientId = :pid', { pid: patient.id })
      .orWhere('v.externalPatientId = :ext', { ext: patient.externalId ?? '' });
    else qb.where('v.externalPatientId = :ext', { ext: patientKey });
    return qb.orderBy('v.visitNo', 'ASC').getMany();
  }

  /** 幂等同步：externalId 命中则更新同一诊次，不重复计数。 */
  async sync(payload: Record<string, any>): Promise<Visit> {
    const externalId = pick<string>(payload, ['externalId', 'external_id']);
    let entity = externalId ? await this.repo.findOne({ where: { externalId } }) : null;

    const externalPatientId = pick<string>(payload, ['externalPatientId', 'external_patient_id', 'patientId', 'patient_id']);
    if (!entity && externalPatientId) {
      entity = await this.repo
        .createQueryBuilder('v')
        .where('v.externalPatientId = :ext', { ext: externalPatientId })
        .andWhere('v.visitNo = :no', { no: Number(pick(payload, ['visitNo', 'visit_no']) ?? 0) })
        .getOne();
    }

    const visit = entity ?? this.repo.create();
    visit.externalId = externalId ?? visit.externalId;
    visit.externalPatientId = externalPatientId ?? visit.externalPatientId;
    visit.visitNo = Number(pick(payload, ['visitNo', 'visit_no']) ?? visit.visitNo ?? 0);
    visit.date = normalizeDate(pick(payload, ['date', 'visitDate', 'visit_date'])) ?? visit.date ?? new Date().toISOString().slice(0, 10);
    visit.channels = toArray(pick(payload, ['channels']));
    visit.raw = pick(payload, ['raw']) ?? {};
    visit.doctorNote = pick(payload, ['doctorNote', 'doctor_note']);
    visit.parsed = pick(payload, ['parsed']) ?? {};
    visit.outcome = pick(payload, ['outcome']) ?? {};
    visit.aiMode = pick<string>(payload, ['aiMode', 'ai_mode']) ?? 'unknown';
    visit.reviewStatus = pick<'pending' | 'confirmed' | 'rejected'>(payload, ['reviewStatus', 'review_status']) ?? 'pending';

    if (!visit.patient && externalPatientId) {
      const patient = await this.patients
        .createQueryBuilder('p')
        .where('p.externalId = :ext', { ext: externalPatientId })
        .getOne();
      if (patient) visit.patient = patient;
    }

    // 绑定就诊档案：支持 uuid 或 Skill 侧外部 ID
    const caseKey = pick<string>(payload, ['caseId', 'case_id', 'externalCaseId', 'external_case_id']);
    if (caseKey && !visit.caseId) {
      const cqb = this.cases.createQueryBuilder('c');
      if (isUuid(caseKey)) cqb.where('c.id = :uuidKey', { uuidKey: caseKey }).orWhere('c.externalId = :key', { key: caseKey });
      else cqb.where('c.externalId = :key', { key: caseKey });
      const caseRecord = await cqb.getOne();
      if (caseRecord) {
        visit.caseRecord = caseRecord;
        visit.caseId = caseRecord.id;
        visit.externalCaseId = caseRecord.externalId;
      }
    }
    return this.repo.save(visit);
  }

  async review(externalId: string, status: 'confirmed' | 'rejected'): Promise<Visit> {
    const visit = await this.repo.findOne({ where: { externalId } });
    if (!visit) throw new Error(`复诊记录不存在: ${externalId}`);
    visit.reviewStatus = status;
    return this.repo.save(visit);
  }
}
