import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return {
      ok: true,
      service: '@tcm/server',
      ai: {
        provider: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com',
        configured: Boolean(process.env.DEEPSEEK_API_KEY),
        asr: process.env.ASR_PROVIDER ?? 'none',
        vision: process.env.VISION_PROVIDER ?? 'none',
      },
      time: new Date().toISOString(),
    };
  }
}
