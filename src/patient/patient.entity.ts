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

@Entity('patient_profiles')
export class PatientProfile {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User,{
    onDelete : 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  age: number;

  @Column()
  gender: string;

  @Column()
  contactDetails: string;

  @Column({
    nullable: true,
    type: 'text',
  })
   basicHealthInformation: string;

 
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}