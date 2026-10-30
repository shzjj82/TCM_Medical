import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Visit } from '../../entities/visit.entity';
import { PatientsModule } from '../patients/patients.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Visit]), PatientsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
