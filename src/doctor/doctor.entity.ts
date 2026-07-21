import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('doctors')
export class Doctor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  fullName: string;

  @Column({
    unique: true,
    length: 150,
  })
  email: string;

  @Column({
    unique: true,
    length: 15,
  })
  mobileNumber: string;

  @Column()
  password: string;

  @Column({
    type: 'text',
  })
  specialization: string;

  @Column({
    type: 'int',
  })
  experience: number;

  @Column({
    default: 'DOCTOR',
  })
  role: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}