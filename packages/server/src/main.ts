import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded, type Request, type Response } from 'express';
import { AppModule } from './app.module';
import { HealthController } from './health.controller';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true, bodyParser: false });
  app.use(json({ limit: '12mb' }));
  app.use(urlencoded({ extended: true, limit: '12mb' }));
  // 统一挂在 /api 前缀下：前端只需配置一个 BASE 就能同时访问 health 与业务接口。
  app.setGlobalPrefix('api');
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 额外保留根路径 /health（存活探针、人工排查常用），内容与 /api/health 一致。
  const health = app.get(HealthController);
  app.getHttpAdapter().get('/health', (_req: Request, res: Response) => {
    res.json(health.health());
  });

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`[server] listening on http://localhost:${port}/api (health: /health 与 /api/health)`);
}

void bootstrap();
