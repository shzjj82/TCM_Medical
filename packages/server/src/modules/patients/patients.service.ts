import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Patient } from '../../entities/patient.entity';
import { normalizeDate, pick, toArray } from '../../common/payload';

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

  /** 同时支持 uuid、Skill 侧 external_id 与姓名模糊查找。 */
  async findOne(key: string): Promise<Patient> {
    const found = await this.repo
      .createQueryBuilder('p')
      .where('p.id = :key OR p.externalId = :key OR p.name = :key', { key })
      .getOne();
    if (!found) throw new NotFoundException(`病人不存在: ${key}`);
    return found;
  }

  /** 幂等同步：externalId 命中则更新，否则新建。 */
  async sync(payload: Record<string, any>): Promise<Patient> {
    const externalId = pick<string>(payload, ['externalId', 'external_id', 'id']);
    const found = externalId
      ? await this.repo.findOne({ where: { externalId } })
      : await this.repo.findOne({ where: { id: pick<string>(payload, ['uuid']) ?? '' } });

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
