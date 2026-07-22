import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientProfile } from './patient.entity';
import { User } from 'src/auth/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PatientProfile,User])],
  providers: [PatientService],
  controllers: [PatientController]
})
export class PatientModule {}
