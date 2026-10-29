import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
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
  list(
    @Query('status') status?: string,
    @Query('q') keyword?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('disease') disease?: string,
    @Query('syndrome') syndrome?: string,
    @Query('course') course?: string,
    @Query('tag') tag?: string,
    @Query('doctor') doctor?: string,
    @Query('visit') visit?: string,
    @Query('view') view?: string,
  ) {
    return this.patients.findAll({
      status,
      keyword,
      disease,
      syndrome,
      course,
      tag,
      doctor,
      visit,
      view,
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 10,
    });
  }

  @Get('facets')
  facets() {
    return this.patients.facets();
  }

  @Get('duplicates')
  duplicates() {
    return this.patients.duplicates();
  }

  @Post('merge')
  merge(@Body() body: { primaryId?: string; duplicateId?: string }) {
    if (!body?.primaryId || !body?.duplicateId) throw new BadRequestException('需要 primaryId 与 duplicateId');
    return this.patients.merge(body.primaryId, body.duplicateId);
  }

  /** 只改病患基本信息，不动就诊档案和疗效对比。 */
  @Patch(':key')
  update(@Param('key') key: string, @Body() body: Record<string, unknown>) {
    return this.patients.updateProfile(key, body);
  }

  /** 病人详情 + 全部就诊档案 + 全部复诊记录，前端病人详情页一次拿全。 */
  @Get(':key')
  async detail(@Param('key') key: string) {
    const patient = await this.patients.findOne(key);
    const [cases, visits] = await Promise.all([
      this.cases.listByPatient(key),
      this.visits.listForPatient(patient.externalId ?? patient.id),
    ]);
    return { ...(await this.patients.present(patient)), cases, visits };
  }

  @Post('sync')
  sync(@Body() body: Record<string, any>) {
    return this.patients.sync(body);
  }
}
