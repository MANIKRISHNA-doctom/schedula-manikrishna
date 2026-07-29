import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { RecurringAvailability } from './recurring-availability.entity';

@Entity('recurring_slots')
export class RecurringSlot {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => RecurringAvailability, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'availabilityId' })
  availability: RecurringAvailability;

  @Column({
    type: 'time',
  })
  startTime: string;

  @Column({
    type: 'time',
  })
  endTime: string;

}