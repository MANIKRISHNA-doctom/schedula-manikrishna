import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';
import { AvailabilityModule } from './availability/availability.module';
import { AppointmentModule } from './appointment/appointment.module';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
  
})
export class AppModule {}