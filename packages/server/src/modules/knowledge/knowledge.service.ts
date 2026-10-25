import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalReference } from '../../entities/external-reference.entity';
import { InternalProtocol } from '../../entities/internal-protocol.entity';
import { pick, toArray } from '../../common/payload';

/** 数据库侧检索：命中标题/标签/适应症/证型/取穴/方剂，命中即加分，最终按分排序。 */
export interface SearchRow {
  id: string;
  externalId?: string;
  title: string;
  score: number;
  payload: Record<string, unknown>;
}

@Injectable()
export class KnowledgeService {
  constructor(
    @InjectRepository(ExternalReference) private readonly refs: Repository<ExternalReference>,
    @InjectRepository(InternalProtocol) private readonly protocols: Repository<InternalProtocol>,
  ) {}

  async searchExternal(query: string, topK = 5): Promise<SearchRow[]> {
    const all = await this.refs.find({ order: { createdAt: 'DESC' }, take: 500 });
    return rank(all.map((row) => ({
      id: row.externalId ?? row.id,
      externalId: row.externalId,
      title: row.title,
      haystack: [
        row.title,
        row.tags?.join(' '),
        row.indications?.join(' '),
        row.syndromes?.join(' '),
        row.acupoints?.join(' '),
        row.prescriptions?.join(' '),
        row.treatmentPrinciple ?? '',
        row.content ?? '',
      ].join(' '),
      payload: row as unknown as Record<string, unknown>,
    })), query, topK);
  }

  async searchInternal(query: string, topK = 5): Promise<SearchRow[]> {
    const all = await this.protocols.find({ order: { visitCount: 'DESC' }, take: 500 });
    return rank(all.map((row) => ({
      id: row.externalId ?? row.id,
      externalId: row.externalId,
      title: row.title,
      haystack: [
        row.title,
        row.tcmDisease ?? '',
        row.tcmSyndrome ?? '',
        JSON.stringify(row.payload ?? {}),
      ].join(' '),
      payload: row as unknown as Record<string, unknown>,
    })), query, topK);
  }

  async syncExternal(payload: Record<string, any>): Promise<ExternalReference> {
    const externalId = pick<string>(payload, ['externalId', 'external_id', 'id']);
    const entity = (externalId ? await this.refs.findOne({ where: { externalId } }) : null) ?? this.refs.create();
    entity.externalId = externalId ?? entity.externalId;
    entity.title = pick<string>(payload, ['title']) ?? entity.title ?? '未命名';
    entity.sourceType = pick(payload, ['sourceType', 'source_type']);
    entity.source = pick(payload, ['source']);
    entity.citation = pick(payload, ['citation']);
    entity.tags = toArray(pick(payload, ['tags']));
    entity.indications = toArray(pick(payload, ['indications']));
    entity.syndromes = toArray(pick(payload, ['syndromes']));
    entity.acupoints = toArray(pick(payload, ['acupoints']));
    entity.prescriptions = toArray(pick(payload, ['prescriptions']));
    entity.treatmentPrinciple = pick(payload, ['treatmentPrinciple', 'treatment_principle']);
    entity.content = pick(payload, ['content']);
    entity.evidenceLevel = pick<string>(payload, ['evidenceLevel', 'evidence_level']) ?? '未分级';
    return this.refs.save(entity);
  }

  async syncInternal(payload: Record<string, any>): Promise<InternalProtocol> {
    const externalId = pick<string>(payload, ['externalId', 'external_id', 'id']);
    const entity = (externalId ? await this.protocols.findOne({ where: { externalId } }) : null) ?? this.protocols.create();
    entity.externalId = externalId ?? entity.externalId;
    entity.title = pick<string>(payload, ['title']) ?? entity.title ?? '未命名方案';
    entity.tcmDisease = pick(payload, ['tcmDisease', 'tcm_disease']);
    entity.tcmSyndrome = pick(payload, ['tcmSyndrome', 'tcm_syndrome']);
    entity.patientCount = Number(pick(payload, ['patientCount', 'patient_count']) ?? 0);
    entity.visitCount = Number(pick(payload, ['visitCount', 'visit_count']) ?? 0);
    entity.effectiveRate = Number(pick(payload, ['effectiveRate', 'effective_rate']) ?? 0);
    entity.payload = payload;
    return this.protocols.save(entity);
  }
}

interface Candidate {
  id: string;
  externalId?: string;
  title: string;
  haystack: string;
  payload: Record<string, unknown>;
}

function rank(rows: Candidate[], query: string, topK: number): SearchRow[] {
  const terms = String(query ?? '')
    .split(/[\s,，、。;；:：/|()（）]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!terms.length) {
    return rows.slice(0, topK).map(({ id, externalId, title, payload }) => ({ id, externalId, title, score: 0, payload }));
  }
  return rows
    .map((row) => ({
      id: row.id,
      externalId: row.externalId,
      title: row.title,
      score: terms.reduce((acc, term) => acc + (row.haystack.includes(term) ? 1 : 0), 0),
      payload: row.payload,
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
