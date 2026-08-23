import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentModule } from './appointment/appointment.module';
import { ConfigModule } from '@nestjs/config';
import { MailService } from './email/email.service';
import { NotificationsModule } from './notifications/notifications.module';
import { AppointmentReminderModule } from './appointment-reminder/appointment-reminder.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AppointmentReminderModule,
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    TypeOrmModule.forRoot({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  autoLoadEntities: true,
  synchronize: false,
  ssl: {
    rejectUnauthorized: false,
  },
}),
    DoctorModule,
    AuthModule,
    PatientModule,
    AvailabilityModule,
    AppointmentModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService, MailService],
  
})
export class AppModule {}