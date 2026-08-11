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
import { Notification } from 'src/notifications/notifications.entity';
import { MailModule } from 'src/email/email.module';

@Module({
  imports: [
      MailModule,
      TypeOrmModule.forFeature([
        Appointment,
        User,
        CustomSlot,
        CustomAvailability,
        RecurringAvailability,
        RecurringSlot,
        Notification
      ]),
    ],
  controllers: [AppointmentController],
  providers: [AppointmentService]
})
export class AppointmentModule {}
