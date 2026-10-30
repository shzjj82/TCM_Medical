import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiModule } from './modules/ai/ai.module';
import { AuthModule } from './modules/auth/auth.module';
import { CasesModule } from './modules/cases/cases.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { PatientsModule } from './modules/patients/patients.module';
import { HealthController } from './health.controller';
import { FilesController } from './modules/files/files.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../../.env'] }),
    TypeOrmModule.forRootAsync({
      useFactory: () => ({
        type: 'postgres',
        host: process.env.DB_HOST ?? 'localhost',
        port: Number(process.env.DB_PORT ?? 5432),
        username: process.env.DB_USERNAME ?? 'postgres',
        password: process.env.DB_PASSWORD ?? 'postgres',
        database: process.env.DB_DATABASE ?? 'tcm_medical',
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        // 开发期用 synchronize 自动建表；生产请关闭并改用 migration
        synchronize: process.env.DB_SYNCHRONIZE !== 'false',
        autoLoadEntities: true,
        logging: process.env.DB_LOGGING === 'true',
      }),
    }),
    AuthModule,
    DashboardModule,
    PatientsModule,
    CasesModule,
    KnowledgeModule,
    AiModule,
  ],
  controllers: [HealthController, FilesController],
})
export class AppModule {}
