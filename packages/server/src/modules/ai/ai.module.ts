import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PatientsModule } from '../patients/patients.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { SkillsController } from './skills.controller';
import { SkillsService } from './skills.service';

@Module({
  imports: [PatientsModule, KnowledgeModule],
  controllers: [AiController, SkillsController],
  providers: [AiService, SkillsService],
  exports: [AiService, SkillsService],
})
export class AiModule {}
