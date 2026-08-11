import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../auth/user.entity';
import { Appointment } from '../appointment/appointment.entity';

@Entity('notifications')
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: User;

  @ManyToOne(() =>Appointment , { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'appointmentId' })
  appointment: Appointment;

  @Column({
    type: 'enum',
    enum: [
      'APPOINTMENT_BOOKED',
      'APPOINTMENT_CANCELLED',
      'APPOINTMENT_RESCHEDULED',
    ],
  })
  type: string;

  @Column()
  title: string;

  @Column({ default: false })
  isRead: boolean;
  
  @Column()
  message: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}