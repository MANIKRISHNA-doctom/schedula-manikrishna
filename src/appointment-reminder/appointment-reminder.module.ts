import { Module } from '@nestjs/common';

import { AppointmentReminderService } from './appointment-reminder.service';
import { MailModule } from 'src/email/email.module';

@Module({
  imports: [
    MailModule,
  ],
  providers: [
    AppointmentReminderService,
  ],
  exports: [
    AppointmentReminderService,
  ],
})
export class AppointmentReminderModule {}