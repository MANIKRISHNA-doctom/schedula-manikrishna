import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DoctorService } from './doctor.service';
import { DoctorController } from './doctor.controller';
import { DoctorProfile } from './doctor.entity';
import { User } from 'src/auth/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([DoctorProfile,User])],
  providers: [DoctorService],
  controllers: [DoctorController]
})
export class DoctorModule {}
