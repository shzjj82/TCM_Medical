import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseDiagnosis, CaseExam, CaseHistory } from '../../entities/case-clinical.entity';
import { CaseRecord } from '../../entities/case-record.entity';
import { InternalProtocol } from '../../entities/internal-protocol.entity';
import { Patient } from '../../entities/patient.entity';
import { Visit } from '../../entities/visit.entity';
import { CasesController } from './cases.controller';
import { CasesService } from './cases.service';

@Module({
  imports: [TypeOrmModule.forFeature([CaseRecord, CaseHistory, CaseDiagnosis, CaseExam, Visit, Patient, InternalProtocol])],
  controllers: [CasesController],
  providers: [CasesService],
  exports: [CasesService],
})
export class CasesModule {}
