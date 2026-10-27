import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CaseRecord } from '../../entities/case-record.entity';
import { Patient } from '../../entities/patient.entity';
import { Visit } from '../../entities/visit.entity';
import { CasesModule } from '../cases/cases.module';
import { PatientsController } from './patients.controller';
import { PatientsService } from './patients.service';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [TypeOrmModule.forFeature([Patient, Visit, CaseRecord]), CasesModule],
  controllers: [PatientsController, VisitsController],
  providers: [PatientsService, VisitsService],
  exports: [PatientsService, VisitsService],
})
export class PatientsModule {}
