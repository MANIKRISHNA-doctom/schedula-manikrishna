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

import { CustomSlot } from '../availability/custom-slot.entity';
import { RecurringSlot } from '../availability/recurring-slot.entity';

import { CustomAvailability } from '../availability/custom-availability.entity';
import { RecurringAvailability } from '../availability/recurring-availability.entity';

@Entity('appointments')
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Patient who booked
  @ManyToOne(() => User,{
    onDelete : 'CASCADE',
  })
  @JoinColumn({ name: 'patientId' })
  patient: User;

  // Doctor
  @ManyToOne(() => User,{
    onDelete : 'CASCADE'
  })
  @JoinColumn({ name: 'doctorId' })
  doctor: User;
  
  // Appointment date
  @Column({
    type: 'date',
  })
  appointmentDate: string;

  // WAVE slot
  @ManyToOne(() => CustomSlot, {
    nullable: true,
  })
  @JoinColumn({ name: 'customSlotId' })
  customSlot?: CustomSlot;

  @ManyToOne(() => RecurringSlot, {
    nullable: true,
  })
  @JoinColumn({ name: 'recurringSlotId' })
  recurringSlot?: RecurringSlot;

  // WAVE availability

  @ManyToOne(() => CustomAvailability, {
    nullable: true,
  })
  @JoinColumn({ name: 'customAvailabilityId' })
  customAvailability?: CustomAvailability;

  @ManyToOne(() => RecurringAvailability, {
    nullable: true,
  })
  @JoinColumn({ name: 'recurringAvailabilityId' })
  recurringAvailability?: RecurringAvailability;

  @Column({
    type: 'enum',
    enum: ['STREAM', 'WAVE'],
  })
  schedulingType: string;

  // Only for STREAM

  @Column({
    nullable: true,
  })
  tokenNumber: number;

  @Column({
    type: 'enum',
    enum: ['BOOKED', 'CANCELLED', 'COMPLETED'],
    default: 'BOOKED',
  })
  status: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
