import { DataSource } from 'typeorm';
import { User } from './src/auth/user.entity';
import { DoctorProfile } from './src/doctor/doctor.entity';
import { PatientProfile } from './src/patient/patient.entity';
import { RecurringAvailability } from './src/availability/recurring-availability.entity';
import { CustomAvailability } from './src/availability/custom-availability.entity';


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
    CustomAvailability
  ],

  migrations: [
    'src/migrations/*.ts',
  ],
  synchronize: false,

});