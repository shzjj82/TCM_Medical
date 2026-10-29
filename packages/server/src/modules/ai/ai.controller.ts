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

  /** 按当前页签，只摘材料里写明的字段。 */
  @Post('extract')
  extract(@Body() body: { text?: string; section?: string }) {
    return this.ai.extractSection(body ?? {});
  }

  /** 对照上一次记录，只摘本次口述里说清的变化。 */
  @Post('compare')
  compare(@Body() body: { previous?: string; current?: string }) {
    return this.ai.compareVisit(body ?? {});
  }

  /** 根据本次情况生成病情摘要，由医生修改后再保存。 */
  @Post('summary')
  summary(@Body() body: { previous?: string; current?: string }) {
    return this.ai.summarizeVisit(body ?? {});
  }

  /** 上传录音：转写后拆成主诉字段，不直接建档。 */
  @Post('intake-audio')
  intakeAudio(@Body() body: { audioBase64?: string; mime?: string }) {
    return this.ai.transcribeIntake(body ?? {});
  }
}
