import { Module } from '@nestjs/common';
import { PatientService } from './patient.service';
import { PatientController } from './patient.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PatientProfile } from './patient.entity';
import { User } from 'src/auth/user.entity';
import { CustomSlot } from 'src/availability/custom-slot.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { Appointment } from 'src/appointment_booking/appointment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([PatientProfile,User,Appointment,CustomSlot,RecurringSlot,CustomAvailability,RecurringAvailability])],
  providers: [PatientService],
  controllers: [PatientController]
})
export class PatientModule {}
