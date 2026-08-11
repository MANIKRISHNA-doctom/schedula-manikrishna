import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../auth/user.entity';

@Entity('doctor_profiles')
export class DoctorProfile {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User,{
    onDelete : 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  specialization: string;

  @Column()
  experience: number;

  @Column()
  qualification: string;

  @Column('text')
  profileDetails: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}