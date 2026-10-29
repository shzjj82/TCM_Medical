import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PatientContact } from '../../entities/patient-contact.entity';
import { Patient } from '../../entities/patient.entity';
import { CaseRecord } from '../../entities/case-record.entity';
import { Visit } from '../../entities/visit.entity';
import { DEFAULT_GENDER, readGender } from '../../common/dicts';
import { ageFromBirth, encryptIdCard, maskIdCard, normalizeIdCard, normalizePhone, parseBirthDate } from '../../common/id-card';
import { isUuid, normalizeDate, pick, toArray } from '../../common/payload';
import { CasesService } from '../cases/cases.service';

export interface ListPatientsParams {
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  disease?: string;
  syndrome?: string;
  course?: string;
  tag?: string;
  doctor?: string;
  /** d7 | d30 | d90 | over30 | over90 */
  visit?: string;
  /** recent | followup | overdue | treating | closed */
  view?: string;
}

export interface PatientFacets {
  diseases: string[];
  syndromes: string[];
  tags: string[];
  doctors: string[];
}

export interface DuplicatePatient {
  id: string;
  externalId?: string;
  name: string;
  phone?: string;
  gender?: string;
  age?: number;
  doctor?: string;
  visitCount: number;
  tags: string[];
}

export interface DuplicateGroup {
  reason: string;
  patients: DuplicatePatient[];
}

export interface PatientListResult {
  items: Patient[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly repo: Repository<Patient>,
    @InjectRepository(PatientContact) private readonly contacts: Repository<PatientContact>,
    @InjectRepository(CaseRecord) private readonly caseRepo: Repository<CaseRecord>,
    @InjectRepository(Visit) private readonly visitRepo: Repository<Visit>,
    private readonly cases: CasesService,
  ) {}

  /** 列表：每个病患附带「最近一次档案」（活跃优先）及其多次治疗对比数据。 */
  async findAll({
    status, keyword, page = 1, pageSize = 10, disease, syndrome, course, tag, doctor, visit, view,
  }: ListPatientsParams): Promise<PatientListResult> {
    const size = Math.min(50, Math.max(1, Math.trunc(pageSize) || 10));
    const current = Math.max(1, Math.trunc(page) || 1);
    const qb = this.repo.createQueryBuilder('p').orderBy('p.updatedAt', 'DESC');
    if (status) qb.andWhere('p.status = :status', { status });
    if (keyword) {
      qb.andWhere(
        '(p.name ILIKE :kw OR p.externalId ILIKE :kw OR p.phone ILIKE :kw OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.tags) t WHERE t ILIKE :kw))',
        { kw: `%${keyword}%` },
      );
    }
    if (disease) qb.andWhere(this.caseMatch('tcmDisease', 'disease'), { disease });
    if (syndrome) qb.andWhere(this.caseMatch('tcmSyndrome', 'syndrome'), { syndrome });
    if (tag) {
      qb.andWhere(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.tags) tag WHERE tag = :tag)`, { tag });
    }
    if (doctor) qb.andWhere('p.doctor = :doctor', { doctor });
    const courseSql = this.courseSql(course);
    if (courseSql) qb.andWhere(courseSql);
    const viewCourseSql = this.courseSql(this.viewCourse(view));
    if (viewCourseSql) qb.andWhere(viewCourseSql);
    const visitSql = this.visitSql(visit);
    if (visitSql) qb.andWhere(visitSql);
    const viewVisitSql = this.viewVisitSql(view);
    if (viewVisitSql) qb.andWhere(viewVisitSql);
    if (view === 'followup') qb.andWhere(this.followupSql());
    const total = await qb.clone().getCount();
    const rows = await qb.skip((current - 1) * size).take(size).getMany();
    const latestCases = await this.cases.latestByPatients(rows.map((r) => r.id));
    const items = rows.map((row) => {
      const latestCase = latestCases.get(row.id);
      return latestCase ? Object.assign(row, { latestCase }) : row;
    });
    return { items, total, page: current, pageSize: size };
  }

  /** 同时支持 uuid、Skill 侧 external_id 与姓名查找。 */
  async findOne(key: string): Promise<Patient> {
    const qb = this.repo.createQueryBuilder('p');
    // 两个坑必须同时避开：
    // 1) id 是 uuid 列，非 uuid 的 key（姓名、P-2026-001）不能直接参与 id 比较，
    //    否则 PostgreSQL 抛 invalid input syntax for type uuid。
    // 2) 即便 key 是合法 uuid，也不能让 uuid 列与 varchar 列共用同一个占位符 ——
    //    PG 会按首次出现把参数推断成 uuid，随后 external_id/name 比较即报
    //    「operator does not exist: character varying = uuid」。故拆成独立占位符。
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

  /** 编辑病患基本信息。身份证只写密文和掩码，不回传明文。 */
  async updateProfile(key: string, payload: Record<string, unknown>) {
    const found = await this.findOne(key);
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) throw new BadRequestException('请填写病患姓名');
    const birthDate = parseBirthDate(payload.birthDate ?? payload.birth_date);
    const age = birthDate ? ageFromBirth(birthDate) : null;
    const storedGender = found.gender === '女' ? '女' : DEFAULT_GENDER;
    const privacyConsent = readConsent(payload.privacyConsent ?? payload.privacy_consent, found.privacyConsent);
    const aiConsent = readConsent(payload.aiConsent ?? payload.ai_consent, found.aiConsent);
    const idCard = readIdCardUpdate(payload);
    const tags = Array.isArray(payload.tags)
      ? payload.tags.map((item) => String(item).trim()).filter(Boolean)
      : found.tags;
    await this.repo.update(found.id, {
      name,
      gender: readGender(payload.gender, storedGender),
      birthDate,
      age,
      phone: normalizePhone(payload.phone),
      occupation: blankToNull(payload.occupation),
      residence: blankToNull(payload.residence),
      source: blankToNull(payload.source),
      doctor: blankToNull(payload.doctor),
      tags,
      privacyConsent,
      aiConsent,
      privacyConsentAt: privacyConsent === found.privacyConsent ? found.privacyConsentAt : new Date(),
      aiConsentAt: aiConsent === found.aiConsent ? found.aiConsentAt : new Date(),
      ...idCard,
    } as never);
    await this.saveEmergency(found.id, payload.emergencyContacts ?? payload.emergency_contacts ?? payload.emergencyContact ?? payload.emergency_contact);
    return this.present(await this.findOne(found.id));
  }

  async present(patient: Patient) {
    const emergencyContacts = await this.contacts.find({
      where: { patientId: patient.id, role: 'emergency' },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const view = { ...patient } as Patient & { idCardCipher?: string; emergencyContacts: PatientContact[] };
    delete view.idCardCipher;
    view.emergencyContacts = emergencyContacts;
    return view;
  }

  /** 幂等同步：externalId 命中则更新，否则新建。 */
  async sync(payload: Record<string, any>): Promise<Patient> {
    // payload 里的 id 有可能是 Skill 侧外部 ID（P-2026-001），也有可能是数据库 uuid，
    // 必须先区分：把外部 ID 或空串送进 uuid 列会让 PostgreSQL 抛类型错误（原实现正是如此）。
    const rawId = pick<string>(payload, ['externalId', 'external_id', 'id']);
    const externalId = rawId && !isUuid(rawId) ? rawId : undefined;
    const uuid = isUuid(rawId) ? rawId : pick<string>(payload, ['uuid']);

    const found = externalId
      ? await this.repo.findOne({ where: { externalId } })
      : isUuid(uuid)
        ? await this.repo.findOne({ where: { id: uuid } })
        : undefined;

    const initial = pick(payload, ['initialCondition', 'initial_condition']) ?? {};
    const current = pick(payload, ['currentCondition', 'current_condition']) ?? initial;

    const entity = found ?? this.repo.create();
    entity.externalId = externalId ?? entity.externalId;
    entity.name = pick<string>(payload, ['name']) ?? entity.name ?? '未具名';
    const gender = pick(payload, ['gender']);
    if (gender !== undefined) entity.gender = readGender(gender, entity.gender === '女' ? '女' : DEFAULT_GENDER);
    else if (entity.gender !== '男' && entity.gender !== '女') entity.gender = DEFAULT_GENDER;
    const birth = pick(payload, ['birthDate', 'birth_date']);
    if (birth !== undefined) entity.birthDate = parseBirthDate(birth);
    if (entity.birthDate) entity.age = ageFromBirth(String(entity.birthDate).slice(0, 10));
    else if (pick(payload, ['age']) !== undefined) entity.age = readAge(pick(payload, ['age']));
    const phone = pick(payload, ['phone']);
    if (phone !== undefined) entity.phone = normalizePhone(phone) ?? undefined;
    entity.occupation = pick(payload, ['occupation']) ?? entity.occupation;
    entity.residence = pick(payload, ['residence']) ?? entity.residence;
    entity.source = pick(payload, ['source']) ?? entity.source;
    entity.doctor = pick(payload, ['doctor']) ?? entity.doctor;
    const idCard = pick<string>(payload, ['idCard', 'id_card']);
    if (idCard) {
      const normalized = normalizeIdCard(idCard);
      entity.idCardCipher = encryptIdCard(normalized);
      entity.idCardMask = maskIdCard(normalized);
    }
    entity.tags = toArray(pick(payload, ['tags'])) ?? entity.tags ?? [];
    entity.status = pick<'active' | 'paused' | 'closed'>(payload, ['status']) ?? entity.status ?? 'active';
    entity.visitCount = Number(pick(payload, ['visitCount', 'visit_count']) ?? entity.visitCount ?? 0);
    entity.initialCondition = initial;
    entity.currentCondition = current;
    entity.contrast = pick(payload, ['contrast']) ?? entity.contrast;
    entity.latestSummary = pick(payload, ['latestSummary', 'latest_summary']) ?? entity.latestSummary;
    if (initial && (!initial.date || typeof initial.date !== 'string')) {
      (initial as Record<string, unknown>).date = normalizeDate(pick(payload, ['createdAt', 'created_at'])) ?? new Date().toISOString().slice(0, 10);
    }
    const saved = await this.repo.save(entity);
    if (
      payload.emergencyContacts !== undefined || payload.emergency_contacts !== undefined
      || payload.emergencyContact !== undefined || payload.emergency_contact !== undefined
    ) {
      await this.saveEmergency(
        saved.id,
        payload.emergencyContacts ?? payload.emergency_contacts ?? payload.emergencyContact ?? payload.emergency_contact,
      );
    }
    return this.present(saved);
  }

  /** 整表替换该患者的紧急联系人。空行略过，传入空数组则清空。 */
  private async saveEmergency(patientId: string, value: unknown) {
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
    await this.contacts.delete({ patientId, role: 'emergency' });
    const rows = list.flatMap((item, index) => {
      const contact = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const name = blankToNull(contact.name);
      const relation = blankToNull(contact.relation);
      const phone = blankToNull(contact.phone);
      if (!name && !relation && !phone) return [];
      return [this.contacts.create({ patientId, role: 'emergency', name, relation, phone, sortOrder: index })];
    });
    if (rows.length) await this.contacts.save(rows);
  }

  async facets(): Promise<PatientFacets> {
    const diseases = await this.distinctCase('tcmDisease');
    const syndromes = await this.distinctCase('tcmSyndrome');
    const tags = await this.repo.query(
      `SELECT DISTINCT tag FROM patients p, LATERAL jsonb_array_elements_text(p.tags) tag WHERE tag <> '' ORDER BY tag`,
    ) as Array<{ tag: string }>;
    const doctors = await this.repo.createQueryBuilder('p')
      .select('p.doctor', 'value')
      .where(`p.doctor IS NOT NULL AND p.doctor <> ''`)
      .distinct(true)
      .orderBy('p.doctor', 'ASC')
      .getRawMany<{ value: string }>();
    return {
      diseases,
      syndromes,
      tags: tags.map((row) => row.tag),
      doctors: doctors.map((row) => row.value).filter(Boolean),
    };
  }

  /**
   * 重复档案：
   * - 手机号数字不少于 7 位且相同；
   * - 或姓名相同，且这些档案都没有可用手机号。
   * 不同手机号的同名患者不会并到一组。
   */
  async duplicates(): Promise<DuplicateGroup[]> {
    const rows = await this.repo.find({ order: { updatedAt: 'DESC' } });
    const groups: DuplicateGroup[] = [];
    const byPhone = new Map<string, Patient[]>();
    const byName = new Map<string, Patient[]>();
    for (const row of rows) {
      const phone = phoneKey(row.phone);
      if (phone) {
        const list = byPhone.get(phone) ?? [];
        list.push(row);
        byPhone.set(phone, list);
      }
      const name = row.name.trim();
      if (name) {
        const list = byName.get(name) ?? [];
        list.push(row);
        byName.set(name, list);
      }
    }
    for (const list of byPhone.values()) {
      if (list.length < 2) continue;
      groups.push({ reason: '手机号相同', patients: list.map(toDuplicate) });
    }
    for (const list of byName.values()) {
      const missing = list.filter((row) => !phoneKey(row.phone));
      if (missing.length < 2) continue;
      groups.push({ reason: '姓名相同，且都没有手机号', patients: missing.map(toDuplicate) });
    }
    return groups;
  }

  async merge(primaryId: string, duplicateId: string): Promise<Patient> {
    if (!primaryId || !duplicateId) throw new BadRequestException('需要指定保留档案和被合并档案');
    if (primaryId === duplicateId) throw new BadRequestException('不能把档案合并到自己');
    const primary = await this.repo.findOne({ where: { id: primaryId } });
    const duplicate = await this.repo.findOne({ where: { id: duplicateId } });
    if (!primary) throw new NotFoundException('保留的档案不存在');
    if (!duplicate) throw new NotFoundException('被合并的档案不存在');

    await this.repo.manager.transaction(async (manager) => {
      const taken = duplicate.externalId;
      await manager.update(CaseRecord, { patientId: duplicate.id }, { patientId: primary.id });
      await manager.update(Visit, { patientId: duplicate.id }, { patientId: primary.id });
      if (taken) {
        await manager.update(Visit, { externalPatientId: taken }, {
          externalPatientId: primary.externalId ?? taken,
        });
      }
      if (!primary.externalId && taken) {
        duplicate.externalId = undefined;
        await manager.save(duplicate);
        primary.externalId = taken;
      }
      primary.phone = primary.phone || duplicate.phone;
      primary.gender = primary.gender || duplicate.gender;
      primary.age = primary.age ?? duplicate.age;
      primary.doctor = primary.doctor || duplicate.doctor;
      primary.tags = [...new Set([...(primary.tags ?? []), ...(duplicate.tags ?? [])])];
      primary.visitCount = (primary.visitCount ?? 0) + (duplicate.visitCount ?? 0);
      await manager.save(primary);
      const cases = await manager.find(CaseRecord, { where: { patientId: primary.id }, order: { createdAt: 'ASC' } });
      for (let index = 0; index < cases.length; index += 1) {
        if (cases[index].caseNo !== index + 1) {
          cases[index].caseNo = index + 1;
          await manager.save(cases[index]);
        }
      }
      await manager.remove(duplicate);
    });
    return this.findOne(primary.id);
  }

  private async distinctCase(property: 'tcmDisease' | 'tcmSyndrome'): Promise<string[]> {
    const rows = await this.caseRepo.createQueryBuilder('c')
      .select(`c.${property}`, 'value')
      .where(`c.${property} IS NOT NULL AND c.${property} <> ''`)
      .distinct(true)
      .orderBy(`c.${property}`, 'ASC')
      .getRawMany<{ value: string }>();
    return rows.map((row) => row.value).filter(Boolean);
  }

  private caseMatch(property: 'tcmDisease' | 'tcmSyndrome', param: string): string {
    const table = this.table(this.caseRepo);
    const patientCol = this.quoted(this.caseRepo, 'patientId');
    const field = this.quoted(this.caseRepo, property);
    return `EXISTS (SELECT 1 FROM ${table} c WHERE c.${patientCol} = p.id AND c.${field} = :${param})`;
  }

  /** 与列表展示一致：已结案优先于暂停；没有档案且未结案、未暂停为待建档。 */
  private courseSql(course?: string): string | null {
    if (!course) return null;
    const active = `c.${this.quoted(this.caseRepo, 'status')} = 'active'`;
    const anyCase = this.caseExists();
    const activeCase = this.caseExists(`AND ${active}`);
    if (course === '已结案') return `(p.status = 'closed' OR (${anyCase} AND NOT (${activeCase})))`;
    if (course === '治疗中') return `(p.status NOT IN ('closed', 'paused') AND ${activeCase})`;
    if (course === '待建档') return `(p.status NOT IN ('closed', 'paused') AND NOT (${anyCase}))`;
    if (course === '暂停') return `(p.status = 'paused' AND (NOT (${anyCase}) OR ${activeCase}))`;
    return null;
  }

  private viewCourse(view?: string): string | undefined {
    if (view === 'treating' || view === 'overdue') return '治疗中';
    if (view === 'closed') return '已结案';
    if (view === 'followup') return '';
    return undefined;
  }

  private visitSql(visit?: string): string | null {
    const last = this.lastVisitSql();
    if (visit === 'd7') return `${last} >= CURRENT_DATE - INTERVAL '7 days'`;
    if (visit === 'd30') return `${last} >= CURRENT_DATE - INTERVAL '30 days'`;
    if (visit === 'd90') return `${last} >= CURRENT_DATE - INTERVAL '90 days'`;
    if (visit === 'over30') return `${last} < CURRENT_DATE - INTERVAL '30 days'`;
    if (visit === 'over90') return `${last} < CURRENT_DATE - INTERVAL '90 days'`;
    return null;
  }

  private viewVisitSql(view?: string): string | null {
    const last = this.lastVisitSql();
    if (view === 'recent') return `${last} >= CURRENT_DATE - INTERVAL '14 days'`;
    if (view === 'overdue') return `${last} < CURRENT_DATE - INTERVAL '30 days'`;
    return null;
  }

  private followupSql(): string {
    const table = this.table(this.visitRepo);
    const patientCol = this.quoted(this.visitRepo, 'patientId');
    const dateCol = this.quoted(this.visitRepo, 'date');
    const outcome = this.quoted(this.visitRepo, 'outcome');
    const notClosed = `NOT (${this.courseSql('已结案')})`;
    return `EXISTS (
      SELECT 1 FROM ${table} v
      WHERE v.${patientCol} = p.id
        AND v.${dateCol} = (SELECT MAX(v2.${dateCol}) FROM ${table} v2 WHERE v2.${patientCol} = p.id)
        AND COALESCE(v.${outcome}->>'next_plan', v.${outcome}->>'nextPlan', '') <> ''
    ) AND ${notClosed}`;
  }

  private lastVisitSql(): string {
    const visits = this.table(this.visitRepo);
    const cases = this.table(this.caseRepo);
    const vPatient = this.quoted(this.visitRepo, 'patientId');
    const vDate = this.quoted(this.visitRepo, 'date');
    const cPatient = this.quoted(this.caseRepo, 'patientId');
    const cUpdated = this.quoted(this.caseRepo, 'updatedAt');
    return `COALESCE(
      (SELECT MAX(v.${vDate}) FROM ${visits} v WHERE v.${vPatient} = p.id),
      (SELECT MAX(c.${cUpdated})::date FROM ${cases} c WHERE c.${cPatient} = p.id)
    )`;
  }

  private caseExists(extra = ''): string {
    const table = this.table(this.caseRepo);
    const patientCol = this.quoted(this.caseRepo, 'patientId');
    return `EXISTS (SELECT 1 FROM ${table} c WHERE c.${patientCol} = p.id ${extra})`;
  }

  private table(repo: Repository<CaseRecord> | Repository<Visit>): string {
    return `"${repo.metadata.tableName}"`;
  }

  private quoted(repo: Repository<CaseRecord> | Repository<Visit>, property: string): string {
    const column = repo.metadata.findColumnWithPropertyName(property);
    if (!column) throw new Error(`未知字段 ${property}`);
    return `"${column.databaseName}"`;
  }
}

const CONSENTS = ['unknown', 'granted', 'revoked'] as const;
type Consent = (typeof CONSENTS)[number];

function readConsent(value: unknown, current: Consent = 'unknown'): Consent {
  if (value === undefined || value === null || value === '') return current ?? 'unknown';
  if (!CONSENTS.includes(value as Consent)) throw new BadRequestException('授权状态不正确');
  return value as Consent;
}

function readAge(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const age = Number(value);
  if (!Number.isFinite(age) || age < 0 || age > 150) throw new BadRequestException('年龄不正确');
  return age;
}

function readIdCardUpdate(payload: Record<string, unknown>): { idCardCipher?: string | null; idCardMask?: string | null } {
  if (!('idCard' in payload) && !('id_card' in payload)) return {};
  const raw = 'idCard' in payload ? payload.idCard : payload.id_card;
  if (raw === null || raw === '') return { idCardCipher: null, idCardMask: null };
  const normalized = normalizeIdCard(String(raw));
  return { idCardCipher: encryptIdCard(normalized), idCardMask: maskIdCard(normalized) };
}

function blankToNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function phoneKey(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  return digits.length >= 7 ? digits : '';
}

function toDuplicate(row: Patient): DuplicatePatient {
  return {
    id: row.id,
    externalId: row.externalId,
    name: row.name,
    phone: row.phone,
    gender: row.gender ?? undefined,
    age: row.age ?? undefined,
    doctor: row.doctor,
    visitCount: row.visitCount ?? 0,
    tags: row.tags ?? [],
  };
}
