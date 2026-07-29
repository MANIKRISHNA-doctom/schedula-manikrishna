import { DataSource } from 'typeorm';
import { User } from './src/auth/user.entity';
import { DoctorProfile } from './src/doctor/doctor.entity';
import { PatientProfile } from './src/patient/patient.entity';
import { RecurringAvailability } from './src/availability/recurring-availability.entity';
import { CustomAvailability } from './src/availability/custom-availability.entity';
import { CustomSlot } from './src/availability/custom-slot.entity';
import { RecurringSlot } from './src/availability/recurring-slot.entity';
import { Appointment } from './src/appointment_booking/appointment.entity';


export const AppDataSource = new DataSource({

  type: 'postgres',

  host: 'localhost',

  port: 5432,

  username: 'postgres',

  password: '9848',

  database: 'hospital_db',

  entities: [
    User,
    DoctorProfile,
    PatientProfile,
    RecurringAvailability,
    CustomAvailability,
    CustomSlot,
    RecurringSlot,
    Appointment
  ],

  migrations: [
    'src/migrations/*.ts',
  ],
  synchronize: false,

});