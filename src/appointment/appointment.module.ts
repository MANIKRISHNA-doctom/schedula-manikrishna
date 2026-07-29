import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { Appointment } from './appointment.entity';
import { User } from 'src/auth/user.entity';
import { CustomSlot } from 'src/availability/custom-slot.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';

@Module({
  imports: [
      TypeOrmModule.forFeature([
        Appointment,
        User,
        CustomSlot,
        CustomAvailability,
        RecurringAvailability,
        RecurringSlot
      ]),
    ],
  controllers: [AppointmentController],
  providers: [AppointmentService]
})
export class AppointmentModule {}
