import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '9848',
      database: 'hospital_db',
      autoLoadEntities: true,
      synchronize: false,
    }),
    DoctorModule,
    AuthModule,
    PatientModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  
})
export class AppModule {}