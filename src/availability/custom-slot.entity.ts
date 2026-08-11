import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';

import { CustomAvailability } from './custom-availability.entity';

@Entity('custom_slots')
export class CustomSlot {

  @PrimaryGeneratedColumn('uuid')
  id: string;
  
  @ManyToOne(() => CustomAvailability, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'availabilityId' })
  availability: CustomAvailability;

  @Column({
    type: 'time',
  })
  startTime: string;

  @Column({
    type: 'time',
  })
  endTime: string;

  @Column({
    default: false,
  })
  isBooked: boolean;
}