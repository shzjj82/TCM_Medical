import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  /** 外部治疗参考库检索。 */
  @Get('external')
  external(@Query('q') q = '', @Query('topK') topK?: string) {
    return this.knowledge.searchExternal(q, topK ? Number(topK) : 5);
  }

  @Post('external/sync')
  syncExternal(@Body() body: Record<string, any>) {
    return this.knowledge.syncExternal(body);
  }

  /** 内部治疗资料库（本院沉淀）检索。 */
  @Get('internal')
  internal(@Query('q') q = '', @Query('topK') topK?: string) {
    return this.knowledge.searchInternal(q, topK ? Number(topK) : 5);
  }

  @Post('internal/sync')
  syncInternal(@Body() body: Record<string, any>) {
    return this.knowledge.syncInternal(body);
  }
}
