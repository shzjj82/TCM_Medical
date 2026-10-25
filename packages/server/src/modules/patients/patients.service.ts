import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../../entities/patient.entity';
import { isUuid, normalizeDate, pick, toArray } from '../../common/payload';

export interface ListPatientsParams {
  status?: string;
  keyword?: string;
  limit?: number;
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient) private readonly repo: Repository<Patient>,
  ) {}

  async findAll({ status, keyword, limit = 100 }: ListPatientsParams): Promise<Patient[]> {
    const qb = this.repo.createQueryBuilder('p').orderBy('p.updatedAt', 'DESC').limit(limit);
    if (status) qb.andWhere('p.status = :status', { status });
    if (keyword) {
      qb.andWhere(
        '(p.name ILIKE :kw OR p.externalId ILIKE :kw OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(p.tags) t WHERE t ILIKE :kw))',
        { kw: `%${keyword}%` },
      );
    }
    return qb.getMany();
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
    entity.gender = pick(payload, ['gender']) ?? entity.gender;
    entity.age = pick(payload, ['age']) ?? entity.age;
    entity.phone = pick(payload, ['phone']) ?? entity.phone;
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
    return this.repo.save(entity);
  }
}
