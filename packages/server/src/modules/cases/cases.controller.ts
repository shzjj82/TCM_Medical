import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CasesService } from './cases.service';

@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  /** 档案列表：按病患查（?patientId=），或查全部已归档（?status=archived，内部知识库数据源）。 */
  @Get()
  list(@Query('patientId') patientId?: string, @Query('status') status?: string) {
    if (status === 'archived') return this.cases.listArchived();
    if (!patientId) return [];
    return this.cases.listByPatient(patientId);
  }

  @Get(':key')
  async detail(@Param('key') key: string) {
    const record = await this.cases.findOne(key);
    const visits = await this.cases.listVisits(key);
    return { ...record, visits };
  }

  @Post()
  create(@Body() body: Record<string, any>) {
    return this.cases.create(body);
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body() body: Record<string, any>) {
    return this.cases.update(key, body);
  }

  /** 多次治疗：追加一条治疗记录 */
  @Post(':key/visits')
  addVisit(@Param('key') key: string, @Body() body: Record<string, any>) {
    return this.cases.addVisit(key, body);
  }

  /** 归档：档案只读 + 快照固化 + 写入内部知识库（幂等） */
  @Post(':key/archive')
  archive(@Param('key') key: string) {
    return this.cases.archive(key);
  }
}
