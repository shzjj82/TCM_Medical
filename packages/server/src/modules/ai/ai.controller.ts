import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { AiService } from './ai.service';

@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('status')
  status() {
    return this.ai.status();
  }

  /** 治疗建议：外部参考库 + 内部资料库 + 本院医案，联合给出带来源的方案。 */
  @Post('advise')
  advise(
    @Body() body: { text?: string; patientId?: string; topK?: number },
    @Query('text') queryText?: string,
  ) {
    return this.ai.recommend({ text: body?.text ?? queryText, patientId: body?.patientId, topK: body?.topK });
  }

  @Get('advise')
  adviseGet(@Query('text') text: string, @Query('patientId') patientId?: string, @Query('topK') topK?: string) {
    return this.ai.recommend({ text, patientId, topK: topK ? Number(topK) : undefined });
  }

  /** 把医生口述文本解析成结构化医案（预览用，不直接落库）。 */
  @Post('parse')
  parse(@Body() body: { text?: string; doctorNote?: string }) {
    return this.ai.parseNote(body ?? {});
  }
}
