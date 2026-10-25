import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../../entities/patient.entity';
import { Visit } from '../../entities/visit.entity';
import { normalizeDate, pick, toArray } from '../../common/payload';

@Injectable()
export class VisitsService {
  constructor(
    @InjectRepository(Visit) private readonly repo: Repository<Visit>,
    @InjectRepository(Patient) private readonly patients: Repository<Patient>,
  ) {}

  async listForPatient(patientKey: string): Promise<Visit[]> {
    const patient = await this.patients
      .createQueryBuilder('p')
      .where('p.id = :key OR p.externalId = :key', { key: patientKey })
      .getOne();
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
    return this.repo.save(visit);
  }

  async review(externalId: string, status: 'confirmed' | 'rejected'): Promise<Visit> {
    const visit = await this.repo.findOne({ where: { externalId } });
    if (!visit) throw new Error(`复诊记录不存在: ${externalId}`);
    visit.reviewStatus = status;
    return this.repo.save(visit);
  }
}
