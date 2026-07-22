import { DataSource } from 'typeorm';
import { User } from './src/auth/user.entity';
import { DoctorProfile } from './src/doctor/doctor.entity';
import { PatientProfile } from './src/patient/patient.entity';


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
  ],

  migrations: [
    'src/migrations/*.ts',
  ],
  synchronize: false,

});