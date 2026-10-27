import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CasesService } from '../cases/cases.service';
import { PatientsService } from './patients.service';
import { VisitsService } from './visits.service';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
    private readonly cases: CasesService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('q') keyword?: string, @Query('limit') limit?: string) {
    return this.patients.findAll({ status, keyword, limit: limit ? Number(limit) : 100 });
  }

  /** 病人详情 + 全部就诊档案 + 全部复诊记录，前端病人详情页一次拿全。 */
  @Get(':key')
  async detail(@Param('key') key: string) {
    const patient = await this.patients.findOne(key);
    const [cases, visits] = await Promise.all([
      this.cases.listByPatient(key),
      this.visits.listForPatient(patient.externalId ?? patient.id),
    ]);
    return { ...patient, cases, visits };
  }

  @Post('sync')
  sync(@Body() body: Record<string, any>) {
    return this.patients.sync(body);
  }
}
