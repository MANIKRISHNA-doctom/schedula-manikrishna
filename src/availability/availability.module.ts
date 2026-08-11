import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';
import { RecurringSlot } from './recurring-slot.entity';
import { User } from 'src/auth/user.entity';
import { CustomSlot } from './custom-slot.entity';
import { Appointment } from 'src/appointment/appointment.entity';
import { MailModule } from 'src/email/email.module';

@Module({
  imports: [
    MailModule,
    TypeOrmModule.forFeature([
      User,
      RecurringAvailability,
      CustomAvailability,
      RecurringSlot,
      CustomSlot,
      Appointment
    ]),
  ],

  controllers: [AvailabilityController],

  providers: [AvailabilityService],
})
export class AvailabilityModule {}