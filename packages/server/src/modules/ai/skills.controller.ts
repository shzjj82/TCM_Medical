import { Body, Controller, Get, Post } from '@nestjs/common';
import { normalizeDate } from '../../common/payload';
import { SkillsService } from './skills.service';

@Controller('skills')
export class SkillsController {
  constructor(private readonly skills: SkillsService) {}

  /** 列出已注册的 Skill 及其工具（供前端「技能面板」与 LLM 工具调用）。 */
  @Get()
  list() {
    return this.skills.list();
  }

  @Get('triggers')
  triggers() {
    return this.skills.listTriggers();
  }

  /** 直接执行某个 Skill 工具（幂等，走 Skill CLI，结果与本地命令行一致）。 */
  @Post('run')
  run(@Body() body: { tool: string; params?: Record<string, unknown> }) {
    return this.skills.run(body.tool, body.params ?? {});
  }

  /** Agent 自然语言入口：由模型自动选择工具执行。 */
  @Post('chat')
  chat(@Body() body: { message: string }) {
    return this.skills.chat(body?.message ?? '');
  }

  /** 便捷端点：一次跟进录入（语音/图片路径或文本 + 医生批注）。 */
  @Post('followup')
  followup(
    @Body()
    body: {
      patient: string;
      text?: string;
      doctorNote?: string;
      audio?: string;
      image?: string;
      severity?: number;
      visitDate?: string;
    },
  ) {
    return this.skills.run('tcm_followup', {
      patient: body.patient,
      text: body.text,
      'doctor-note': body.doctorNote,
      audio: body.audio,
      image: body.image,
      severity: body.severity,
      'visit-date': normalizeDate(body.visitDate),
      format: 'json',
    });
  }
}
