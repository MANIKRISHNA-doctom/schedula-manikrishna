import 'dotenv/config';
import { DataSource } from 'typeorm';

import { User } from './src/auth/user.entity';
import { DoctorProfile } from './src/doctor/doctor.entity';
import { PatientProfile } from './src/patient/patient.entity';
import { RecurringAvailability } from './src/availability/recurring-availability.entity';
import { CustomAvailability } from './src/availability/custom-availability.entity';
import { CustomSlot } from './src/availability/custom-slot.entity';
import { RecurringSlot } from './src/availability/recurring-slot.entity';
import { Appointment } from './src/appointment/appointment.entity';
import { Notification } from './src/notifications/notifications.entity';

export const AppDataSource = new DataSource({
  type: 'postgres',

  url: process.env.DATABASE_URL,

  ssl: {
    rejectUnauthorized: false,
  },

  entities: [
    User,
    DoctorProfile,
    PatientProfile,
    RecurringAvailability,
    CustomAvailability,
    CustomSlot,
    RecurringSlot,
    Appointment,
    Notification
  ],

  migrations: ['src/migrations/*.ts'],

  synchronize: false,
});