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

@Entity('recurring_availability')
export class RecurringAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User,{
    onDelete : 'CASCADE',
  })
  @JoinColumn({ name: 'doctorId' })
  doctor: User;

  @Column({
    type: 'enum',
    enum: [
      'MONDAY',
      'TUESDAY',
      'WEDNESDAY',
      'THURSDAY',
      'FRIDAY',
      'SATURDAY',
      'SUNDAY',
    ],
  })
  dayOfWeek: string;

  @Column({
    type: 'enum',
    enum: ['STREAM', 'WAVE'],
  })
  schedulingType: string;

  @Column({
    type: 'time',
  })
  startTime: string;

  @Column({
    type: 'time',
  })
  endTime: string;

  @Column({
    type: 'int',
    nullable: true,
  })
  duration: number;

  @Column({
    type: 'int',
    nullable: true,
  })
  bufferTime: number;

  @Column({
    type: 'int',
    nullable: true,
  })
  maxCapacity: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
