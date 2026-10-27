import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: '@tcm/server',
      ai: {
        provider:
          process.env.LLM_BASE_URL ??
          process.env.QWEN_BASE_URL ??
          process.env.DEEPSEEK_BASE_URL ??
          'https://dashscope.aliyuncs.com/compatible-mode/v1',
        configured: Boolean(process.env.LLM_API_KEY ?? process.env.QWEN_API_KEY ?? process.env.DEEPSEEK_API_KEY),
        enabled: Boolean(process.env.LLM_API_KEY ?? process.env.QWEN_API_KEY ?? process.env.DEEPSEEK_API_KEY),
        asr: process.env.ASR_PROVIDER ?? 'none',
        vision: process.env.VISION_PROVIDER ?? 'none',
      },
      time: new Date().toISOString(),
    };
  }
}
