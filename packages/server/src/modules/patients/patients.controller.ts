import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PatientsService } from './patients.service';
import { VisitsService } from './visits.service';

@Controller('patients')
export class PatientsController {
  constructor(
    private readonly patients: PatientsService,
    private readonly visits: VisitsService,
  ) {}

  @Get()
  list(@Query('status') status?: string, @Query('q') keyword?: string, @Query('limit') limit?: string) {
    return this.patients.findAll({ status, keyword, limit: limit ? Number(limit) : 100 });
  }

  /** 病人详情 + 期初/末期对比 + 全部复诊记录，前端病人详情页一次拿全。 */
  @Get(':key')
  async detail(@Param('key') key: string) {
    const patient = await this.patients.findOne(key);
    const visits = await this.visits.listForPatient(patient.externalId ?? patient.id);
    return { ...patient, visits };
  }

  @Post('sync')
  sync(@Body() body: Record<string, any>) {
    return this.patients.sync(body);
  }
}
