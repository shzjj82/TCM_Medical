import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VisitsService } from './visits.service';

@Controller('visits')
export class VisitsController {
  constructor(private readonly visits: VisitsService) {}

  @Get()
  list(@Query('patientId') patientId: string) {
    return this.visits.listForPatient(patientId);
  }

  @Post('sync')
  sync(@Body() body: Record<string, any>) {
    return this.visits.sync(body);
  }

  /** 医生确认/驳回 AI 抽取结果：review_status pending → confirmed / rejected。 */
  @Patch(':externalId/review')
  review(
    @Param('externalId') externalId: string,
    @Body() body: { status?: 'confirmed' | 'rejected' },
  ) {
    return this.visits.review(externalId, body?.status === 'rejected' ? 'rejected' : 'confirmed');
  }
}
