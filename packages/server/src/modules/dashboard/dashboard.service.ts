import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Visit } from '../../entities/visit.entity';
import { PatientsService } from '../patients/patients.service';

/** 工作台汇总：只读已有患者/就诊/审核数据，不编造名单。 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly patients: PatientsService,
    @InjectRepository(Visit) private readonly visits: Repository<Visit>,
  ) {}

  async summary() {
    const [today, overdue, followup, recent, pendingAiTotal, pendingAiRows] = await Promise.all([
      this.patients.findAll({ visit: 'today', page: 1, pageSize: 8 }),
      this.patients.findAll({ view: 'overdue', page: 1, pageSize: 1 }),
      this.patients.findAll({ view: 'followup', page: 1, pageSize: 1 }),
      this.patients.findAll({ view: 'recent', page: 1, pageSize: 8 }),
      this.visits.count({ where: { reviewStatus: 'pending' } }),
      this.visits.find({
        relations: ['patient'],
        where: { reviewStatus: 'pending' },
        order: { updatedAt: 'DESC' },
        take: 8,
      }),
    ]);

    return {
      today: { total: today.total, items: today.items },
      pendingReturn: { total: overdue.total },
      pendingFollowup: { total: followup.total },
      pendingAiReview: {
        total: pendingAiTotal,
        items: pendingAiRows.map((visit) => ({
          id: visit.id,
          visitNo: visit.visitNo,
          date: visit.date,
          kind: visit.kind ?? null,
          reviewStatus: visit.reviewStatus,
          patient: visit.patient
            ? {
                id: visit.patient.id,
                externalId: visit.patient.externalId,
                name: visit.patient.name,
                gender: visit.patient.gender ?? undefined,
                age: visit.patient.age ?? undefined,
              }
            : null,
        })),
      },
      pendingKnowledge: { total: 0 },
      recent: { total: recent.total, items: recent.items },
    };
  }
}
