import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger
} from '@nestjs/common';

import { InjectRepository ,} from '@nestjs/typeorm';

import { DataSource, Repository,EntityManager } from 'typeorm';
import { MailService } from 'src/email/email.service';
import { User } from 'src/auth/user.entity';

import { CustomSlot } from './custom-slot.entity';
import { RecurringSlot } from './recurring-slot.entity';
import { Appointment } from 'src/appointment/appointment.entity';
import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';
import { Notification } from 'src/notifications/notifications.entity';

import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';
import { UpdateCustomAvailabilityDto } from './dto/update-custom-availability.dto';
import { ExpandShrinkAvailabilityDto } from './dto/expand-shrink-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    @InjectRepository(Appointment)
    private readonly appointmentRepository: Repository<Appointment>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(RecurringAvailability)
    private readonly recurringRepository: Repository<RecurringAvailability>,

    @InjectRepository(CustomAvailability)
    private readonly customRepository: Repository<CustomAvailability>,

    @InjectRepository(CustomSlot)
    private customSlotRepository: Repository<CustomSlot>,

    @InjectRepository(RecurringSlot)
    private recurringSlotRepository: Repository<RecurringSlot>,
  ) {}

  private readonly logger = new Logger(MailService.name);
    //Create Notification
    private async createNotification(
    manager: EntityManager,
    patientId: string,
    type:
      | 'APPOINTMENT_BOOKED'
      | 'APPOINTMENT_CANCELLED'
      | 'APPOINTMENT_RESCHEDULED',
    title: string,
    message: string,
    appointmentId: string,
  ) {
    const notificationRepository = manager.getRepository(Notification);
  
    // Prevent duplicate notification for the same appointment event
    const existingNotification = await notificationRepository.findOne({
      where: {
        patient: {
          id: patientId,
        },
        type,
        appointment: {
          id: appointmentId,
        },
      },
    });
  
    if (existingNotification) {
      return existingNotification;
    }
  
    const notification = notificationRepository.create({
      patient: { id: patientId },
      type,
      title,
      message,
      appointment: { id: appointmentId },
    });
  
    return await notificationRepository.save(notification);
  }
  
  private async findNextAvailableSlot(
    doctorId: string,
    appointmentDate: string,
    reserved: Set<string>,
    daysToSearch: number,
    Priority: "CUSTOM" | "RECURRING",
    excludedAvailabilityId?: string,
    excludedSlotIds: Set<string> = new Set(),
  ) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(appointmentDate);
    if (start < today) {
      throw new BadRequestException('Cannot reschedule a past appointment.');
    }

    const searchEnd = new Date(start);
    searchEnd.setDate(searchEnd.getDate() + daysToSearch);

    // Do not go beyond booking window
    const bookingEnd = new Date(today);
    bookingEnd.setDate(bookingEnd.getDate() + 30);

    const end = searchEnd < bookingEnd ? searchEnd : bookingEnd;

    if(Priority == 'CUSTOM'){
        
      const customAvailabilities = await this.customRepository.find({
        where: {
          doctor: {
            id: doctorId,
          },
          date: appointmentDate,
          schedulingType: 'WAVE',
        },
        order: {
          startTime: 'ASC',
        },
      });

      for (const availability of customAvailabilities) {
        if (
          excludedAvailabilityId &&
          availability.id === excludedAvailabilityId
        ) {
          continue;
        }
        const customSlots = await this.customSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
          },
          order: {
            startTime: 'ASC',
          },
        });

        for (const slot of customSlots) {
          const key = `${slot.id}-${appointmentDate}`;

          if (reserved.has(key)) {
            continue;
          }

          if (slot.isBooked) {
            continue;
          }

          reserved.add(key);

          return {
            appointmentDate: appointmentDate,
            availability,
            slot,
            type: 'CUSTOM',
          };
        }
      }
    } else{
      const day = new Date(appointmentDate)
        .toLocaleDateString('en-US', {
          weekday: 'long',
        })
        .toUpperCase();

      const recurringAvailabilities = await this.recurringRepository.find({
        where: {
          doctor: {
            id: doctorId,
          },
          dayOfWeek: day,
          schedulingType: 'WAVE',
        },
        order: {
          startTime: 'ASC',
        },
      });

      for (const availability of recurringAvailabilities) {
        // Do not use the availability currently
        // being shrunk.
        if (
          excludedAvailabilityId &&
          availability.id === excludedAvailabilityId
        ) {
          continue;
        }

        const recurringSlots = await this.recurringSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
          },
          order: {
            startTime: 'ASC',
          },
        });

        for (const slot of recurringSlots) {
          // Never select a slot that is about to
          // be deleted.
          if (excludedSlotIds.has(slot.id)) {
            continue;
          }

          const key = `${slot.id}-${appointmentDate}`;

          if (reserved.has(key)) {
            continue;
          }

          const booked = await this.appointmentRepository.findOne({
            where: {
              recurringSlot: {
                id: slot.id,
              },
              appointmentDate: appointmentDate,
              status: 'BOOKED',
            },
          });

          if (booked) {
            continue;
          }

          reserved.add(key);

          return {
            appointmentDate,
            availability,
            slot,
            type: 'RECURRING',
          };
        }
    }
    }

    start.setDate(start.getDate() + 1);

    for (
      let date = new Date(start);
      date <= end;
      date.setDate(date.getDate() + 1)
    ) {
      const currentDate = date.toISOString().split('T')[0];

      // ----------------------------------------------
      // 1. CUSTOM AVAILABILITY FIRST
      // ----------------------------------------------

      const customAvailabilities = await this.customRepository.find({
        where: {
          doctor: {
            id: doctorId,
          },
          date: currentDate,
          schedulingType: 'WAVE',
        },
        order: {
          startTime: 'ASC',
        },
      });

      for (const availability of customAvailabilities) {
        const customSlots = await this.customSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
          },
          order: {
            startTime: 'ASC',
          },
        });

        for (const slot of customSlots) {
          const key = `${slot.id}-${currentDate}`;

          if (reserved.has(key)) {
            continue;
          }

          if (slot.isBooked) {
            continue;
          }

          reserved.add(key);

          return {
            appointmentDate: currentDate,
            availability,
            slot,
            type: 'CUSTOM',
          };
        }
      }

      // ----------------------------------------------
      // 2. RECURRING AVAILABILITY
      // ----------------------------------------------

      const day = date
        .toLocaleDateString('en-US', {
          weekday: 'long',
        })
        .toUpperCase();

      const recurringAvailabilities = await this.recurringRepository.find({
        where: {
          doctor: {
            id: doctorId,
          },
          dayOfWeek: day,
          schedulingType: 'WAVE',
        },
        order: {
          startTime: 'ASC',
        },
      });

      for (const availability of recurringAvailabilities) {
        // Do not use the availability currently
        // being shrunk.
        if (
          excludedAvailabilityId &&
          availability.id === excludedAvailabilityId
        ) {
          continue;
        }

        const recurringSlots = await this.recurringSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
          },
          order: {
            startTime: 'ASC',
          },
        });

        for (const slot of recurringSlots) {
          // Never select a slot that is about to
          // be deleted.
          if (excludedSlotIds.has(slot.id)) {
            continue;
          }

          const key = `${slot.id}-${currentDate}`;

          if (reserved.has(key)) {
            continue;
          }

          const booked = await this.appointmentRepository.findOne({
            where: {
              recurringSlot: {
                id: slot.id,
              },
              appointmentDate: currentDate,
              status: 'BOOKED',
            },
          });

          if (booked) {
            continue;
          }

          reserved.add(key);

          return {
            appointmentDate: currentDate,
            availability,
            slot,
            type: 'RECURRING',
          };
        }
      }
    }

    return null;
  }

  private isOutsideRange(
    slotStart: string,
    slotEnd: string,
    startTime: string,
    endTime: string,
  ) {
    return slotStart < startTime || slotEnd > endTime;
  }
  private validateScheduling(dto: any) {
    if (dto.schedulingType === 'WAVE') {
      if (!dto.duration) {
        throw new BadRequestException(
          'Duration is required for WAVE scheduling.',
        );
      }
    }

    if (dto.schedulingType === 'STREAM') {
      if (!dto.maxCapacity) {
        throw new BadRequestException(
          'maxCapacity is required for STREAM scheduling.',
        );
      }

      if (dto.duration) {
        throw new BadRequestException(
          'Duration is not allowed for STREAM scheduling.',
        );
      }

      if (dto.bufferTime) {
        throw new BadRequestException(
          'Buffer time is not allowed for STREAM scheduling.',
        );
      }
    }
  }

  //Function to generate slots
  private async generateSlots(
    availability: any,
    repository: Repository<CustomSlot | RecurringSlot>,
  ) {
    let current = this.timeToMinutes(availability.startTime);
    const end = this.timeToMinutes(availability.endTime);

    while (current + availability.duration <= end) {
      if (repository === this.customSlotRepository) {
        const slot = this.customSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + availability.duration),
          isBooked: false,
        });

        await this.customSlotRepository.save(slot);
      } else {
        const slot = this.recurringSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + availability.duration),
        });

        await this.recurringSlotRepository.save(slot);
      }

      current += availability.duration + (availability.bufferTime ?? 0);
    }
  }

  //Validate date (Handle past date)
  private validateCustomDate(date: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      throw new BadRequestException(
        'Cannot create availability for a past date.',
      );
    }
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);

    return h * 60 + m;
  }

  private minutesToTime(minutes: number): string {
    const h = Math.floor(minutes / 60);

    const m = minutes % 60;

    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  private validateTime(start: string, end: string) {
    if (start >= end) {
      throw new BadRequestException(
        'End time must be greater than start time.',
      );
    }
  }

  private isOverlapping(
    existingStart: number,
    existingEnd: number,
    newStart: number,
    newEnd: number,
  ): boolean {
    return existingStart < newEnd && existingEnd > newStart;
  }

  private async getDoctor(user: any): Promise<User> {
    const doctor = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'DOCTOR',
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found.');
    }

    return doctor;
  }

  private validateDuration(start: string, end: string, duration: number) {
    const startMinutes =
      Number(start.split(':')[0]) * 60 + Number(start.split(':')[1]);

    const endMinutes =
      Number(end.split(':')[0]) * 60 + Number(end.split(':')[1]);

    const total = endMinutes - startMinutes;

    if (duration > total) {
      throw new BadRequestException('Duration cannot exceed availability time');
    }
  }

  async expandRecurring(
    user: any,
    id: string,
    dto: ExpandShrinkAvailabilityDto,
  ) {
    const doctor = await this.getDoctor(user);

    const availability = await this.recurringRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
      relations: {
        doctor: true,
      },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found.');
    }

    if (availability.doctor.id !== doctor.id) {
      throw new ForbiddenException('Not your availability.');
    }

    const newStart = dto.startTime ?? availability.startTime;

    const newEnd = dto.endTime ?? availability.endTime;

    this.validateTime(newStart, newEnd);

    const newStartMinutes = this.timeToMinutes(newStart);
    const newEndMinutes = this.timeToMinutes(newEnd);

    const oldStartMinutes = this.timeToMinutes(availability.startTime);
    const oldEndMinutes = this.timeToMinutes(availability.endTime);

    // No changes
    if (
      newStartMinutes === oldStartMinutes &&
      newEndMinutes === oldEndMinutes
    ) {
      throw new BadRequestException('No changes detected.');
    }

    // Expand only
    if (newStartMinutes > oldStartMinutes || newEndMinutes < oldEndMinutes) {
      throw new BadRequestException(
        'Expand operation cannot reduce availability.',
      );
    }

    // Check overlap with other recurring availabilities
    const existingAvailabilities = await this.recurringRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        dayOfWeek: availability.dayOfWeek,
      },
    });

    for (const slot of existingAvailabilities) {
      if (slot.id === availability.id) {
        continue;
      }

      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(newStart);
      const newEndMinutes = this.timeToMinutes(newEnd);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Expanded availability overlaps with an existing availability.',
        );
      }
    }

    // STREAM
    if (availability.schedulingType === 'STREAM') {
      availability.startTime = newStart;
      availability.endTime = newEnd;

      await this.recurringRepository.save(availability);

      return {
        message: 'Availability expanded successfully.',
        data: {
          dayOfWeek: availability.dayOfWeek,
          schedulingType: availability.schedulingType,
          startTime: availability.startTime,
          endTime: availability.endTime,
        },
      };
    }

    // WAVE

    const duration = availability.duration!;
    const buffer = availability.bufferTime ?? 0;

    const existingSlots = await this.recurringSlotRepository.find({
      where: {
        availability: {
          id: availability.id,
        },
      },
      order: {
        startTime: 'ASC',
      },
    });

     if (existingSlots.length === 0) {
  let current = newStartMinutes;

  while (current + duration <= newEndMinutes) {
    const slot = this.recurringSlotRepository.create({
      availability,
      startTime: this.minutesToTime(current),
      endTime: this.minutesToTime(current + duration),
    });

    await this.recurringSlotRepository.save(slot);

    current += duration + buffer;
  }
} else{
    // Expand earlier
    if (newStart < availability.startTime) {
      let current = this.timeToMinutes(newStart);

      const firstSlot = this.timeToMinutes(existingSlots[0].startTime) - buffer;

      while (current + duration <= firstSlot) {
        const slot = this.recurringSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + duration),
        });

        await this.recurringSlotRepository.save(slot);

        current += duration + buffer;
      }
    }

    // Expand later
    if (newEnd > availability.endTime) {
      const lastSlot = existingSlots[existingSlots.length - 1];

      let current = this.timeToMinutes(lastSlot.endTime) + buffer;

      const end = this.timeToMinutes(newEnd);

      while (current + duration <= end) {
        const slot = this.recurringSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + duration),
        });

        await this.recurringSlotRepository.save(slot);

        current += duration + buffer;
      }
    }
}

    availability.startTime = newStart;
    availability.endTime = newEnd;

    await this.recurringRepository.save(availability);

    const updatedSlots = await this.recurringSlotRepository.find({
      where: {
        availability: {
          id: availability.id,
        },
      },
      order: {
        startTime: 'ASC',
      },
    });

    return {
      message: 'Availability expanded successfully.',
      data: {
        dayOfWeek: availability.dayOfWeek,
        schedulingType: availability.schedulingType,
        startTime: availability.startTime,
        endTime: availability.endTime,
        totalSlots: updatedSlots.length,
        slots: updatedSlots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      },
    };
  }

  async expandCustom(user: any, id: string, dto: ExpandShrinkAvailabilityDto) {
    const doctor = await this.getDoctor(user);

    const availability = await this.customRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
      relations: {
        doctor: true,
      },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found.');
    }

    if (availability.doctor.id !== doctor.id) {
      throw new ForbiddenException('Not your availability.');
    }

    const newStart = dto.startTime ?? availability.startTime;
    const newEnd = dto.endTime ?? availability.endTime;

    this.validateTime(newStart, newEnd);

    const newStartMinutes = this.timeToMinutes(newStart);
    const newEndMinutes = this.timeToMinutes(newEnd);

    const oldStartMinutes = this.timeToMinutes(availability.startTime);
    const oldEndMinutes = this.timeToMinutes(availability.endTime);

    // No changes
    if (
      newStartMinutes === oldStartMinutes &&
      newEndMinutes === oldEndMinutes
    ) {
      throw new BadRequestException('No changes detected.');
    }

    // Expand only
    if (newStartMinutes > oldStartMinutes || newEndMinutes < oldEndMinutes) {
      throw new BadRequestException(
        'Expand operation cannot reduce availability.',
      );
    }

    // Check overlap with other custom availabilities
    const existingAvailabilities = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        date: availability.date,
      },
    });

    for (const slot of existingAvailabilities) {
      // Skip current availability
      if (slot.id === availability.id) {
        continue;
      }

      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(newStart);
      const newEndMinutes = this.timeToMinutes(newEnd);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Expanded availability overlaps with an existing availability.',
        );
      }
    }

    // STREAM
    if (availability.schedulingType === 'STREAM') {
      availability.startTime = newStart;
      availability.endTime = newEnd;

      await this.customRepository.save(availability);

      return {
        message: 'Availability expanded successfully.',
        data: {
          date: availability.date,
          startTime: availability.startTime,
          endTime: availability.endTime,
        },
      };
    }

    // WAVE

    const duration = availability.duration!;
    const buffer = availability.bufferTime ?? 0;

    // Existing slots
    const existingSlots = await this.customSlotRepository.find({
      where: {
        availability: {
          id: availability.id,
        },
      },
      order: {
        startTime: 'ASC',
      },
    });

    // If existing slots is zero
    if (existingSlots.length === 0) {
  let current = newStartMinutes;

  while (current + duration <= newEndMinutes) {
    const slot = this.customSlotRepository.create({
      availability,
      startTime: this.minutesToTime(current),
      endTime: this.minutesToTime(current + duration),
      isBooked: false,
    });

    await this.customSlotRepository.save(slot);

    current += duration + buffer;
  }
} else{
       // Expand Earlier
    if (newStart < availability.startTime) {
      let current = this.timeToMinutes(newStart);

      const firstSlot = this.timeToMinutes(existingSlots[0].startTime) - buffer;

      while (current + duration <= firstSlot) {
        const slot = this.customSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + duration),
          isBooked: false,
        });

        await this.customSlotRepository.save(slot);

        current += duration + buffer;
      }
    }

    // Expand Later
    if (newEnd > availability.endTime) {
      const lastSlot = existingSlots[existingSlots.length - 1];

      let current = this.timeToMinutes(lastSlot.endTime) + buffer;

      const end = this.timeToMinutes(newEnd);

      while (current + duration <= end) {
        const slot = this.customSlotRepository.create({
          availability,
          startTime: this.minutesToTime(current),
          endTime: this.minutesToTime(current + duration),
          isBooked: false,
        });

        await this.customSlotRepository.save(slot);

        current += duration + buffer;
      }
    }
}

    availability.startTime = newStart;
    availability.endTime = newEnd;

    await this.customRepository.save(availability);

    const updatedSlots = await this.customSlotRepository.find({
      where: {
        availability: {
          id: availability.id,
        },
      },
      order: {
        startTime: 'ASC',
      },
    });

    return {
      message: 'Availability expanded successfully.',
      data: {
        date: availability.date,
        startTime: availability.startTime,
        endTime: availability.endTime,
        totalSlots: updatedSlots.length,
        slots: updatedSlots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      },
    };
  }

  async shrinkCustom(user: any, id: string, dto: ExpandShrinkAvailabilityDto) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doctor = await this.getDoctor(user);

      const availability = await queryRunner.manager.findOne(
        this.customRepository.target,
        {
          where: { id },
          relations: {
            doctor: true,
          },
        },
      );

      if (!availability) {
        throw new NotFoundException('Availability not found.');
      }

      if (availability.doctor.id !== doctor.id) {
        throw new ForbiddenException('Not your availability.');
      }

      const newStart = dto.startTime ?? availability.startTime;

      const newEnd = dto.endTime ?? availability.endTime;

      this.validateTime(newStart, newEnd);

      const newStartMinutes = this.timeToMinutes(newStart);
      const newEndMinutes = this.timeToMinutes(newEnd);

      const oldStartMinutes = this.timeToMinutes(availability.startTime);
      const oldEndMinutes = this.timeToMinutes(availability.endTime);
      if (
        newStartMinutes === oldStartMinutes &&
        newEndMinutes === oldEndMinutes
      ) {
        throw new BadRequestException('No changes detected');
      }
      if (newStartMinutes < oldStartMinutes || newEndMinutes > oldEndMinutes) {
        throw new BadRequestException('This is not a shrink operation.');
      }

      if (availability.schedulingType === 'STREAM') {
        availability.startTime = newStart;
        availability.endTime = newEnd;
        await queryRunner.manager.save(availability);
        await queryRunner.commitTransaction();

        return {
          message: 'Custom availability shrinked successfully.',

          data: {
            startTime: availability.startTime,

            endTime: availability.endTime,
          },
        };
      }

      const slots = await queryRunner.manager.find(
        this.customSlotRepository.target,
        {
          where: {
            availability: {
              id: availability.id,
            },
          },
          order: {
            startTime: 'ASC',
          },
        },
      );

      const affectedSlots: any[] = [];
      const availableSlots: any[] = [];
      const slotsToDelete: any[] = [];
      const notifications: any[] = [];
      for (const slot of slots) {
        const outside = this.isOutsideRange(
          slot.startTime,
          slot.endTime,
          newStart,
          newEnd,
        );
        if (!slot.isBooked && !outside) {
          availableSlots.push(slot);
          continue;
        }

        if (outside && slot.isBooked) {
          affectedSlots.push(slot);
        }

        if (outside) {
          slotsToDelete.push(slot);
        }
      }
      const reserved = new Set<string>();

      for (const slot of affectedSlots) {
        const appointment = await queryRunner.manager.findOne(
          this.appointmentRepository.target,
          {
            where: {
              customSlot: {
                id: slot.id,
              },
              status: 'BOOKED',
            },
            relations: {
              customSlot: true,
              patient : true,
              doctor : true
            },
          },
        );

        if (!appointment) {
          slot.isBooked = false;
          await queryRunner.manager.save(slot);
          continue;
        }

        let replacement;

        if (availableSlots.length > 0) {
          const availableslot = availableSlots.shift()!;
          replacement = {
            appointmentDate: appointment.appointmentDate,
            availability: availability,
            slot: availableslot,
            type: 'CUSTOM',
          };
          reserved.add(`${availableslot.id}-${appointment.appointmentDate}`);
        } else {
          replacement = await this.findNextAvailableSlot(
            doctor.id,
            appointment.appointmentDate,
            reserved,
            5,
            "CUSTOM",
            availability.id,
            new Set(slotsToDelete.map(slot => slot.id))
          );
        }

        if (!replacement) {
          throw new BadRequestException(
            'No available slot found within next 4 days.',
          );
        }

        // free old custom slot
        slot.isBooked = false;

        if (replacement.type === 'CUSTOM') {
          appointment.customAvailability = replacement.availability;
          appointment.customSlot = replacement.slot;

          appointment.recurringAvailability = null;
          appointment.recurringSlot = null;

          replacement.slot.isBooked = true;

          await queryRunner.manager.save(slot);
          await queryRunner.manager.save(replacement.slot);
        } else {
          appointment.customAvailability = null;
          appointment.customSlot = null;

          appointment.recurringAvailability = replacement.availability;
          appointment.recurringSlot = replacement.slot;

          await queryRunner.manager.save(slot);
        }

        appointment.appointmentDate = replacement.appointmentDate;

        await queryRunner.manager.save(appointment);

        const appointmentStartTime =
          appointment.customSlot?.startTime ||
          appointment.recurringSlot?.startTime ||
          appointment.recurringAvailability?.startTime ||
          appointment.customAvailability?.startTime;

        if (!appointmentStartTime) {
          throw new Error('Appointment start time could not be determined');
       }

        const appointmentEndTime = 
        appointment.customSlot?.endTime ||
        appointment.recurringSlot?.endTime ||
        appointment.recurringAvailability?.endTime ||
        appointment.customAvailability?.endTime;

       if (!appointmentEndTime) {
          throw new Error('Appointment end time could not be determined');
       }

        //Notification message
        const notificationMessage =
        `Your appointment has been rescheduled to ` +
        `${appointment.appointmentDate} from ` +
        `${appointmentStartTime} to ${appointmentEndTime}.`;

        await this.createNotification(
          queryRunner.manager,
          appointment.patient.id,
          "APPOINTMENT_RESCHEDULED",
          'Appointment rescheduled',
          notificationMessage,
          appointment.id
        );

        notifications.push({
          patientEmail : appointment.patient.email,
          patientFullName : appointment.patient.fullName,
          doctorFullName : appointment.doctor.fullName,
          appointmentDate : appointment.appointmentDate,
          appointmentStartTime
        })
      }

      availability.startTime = newStart;
      availability.endTime = newEnd;
      await queryRunner.manager.save(availability);

      const appointmentRepository =
  queryRunner.manager.getRepository(Appointment);

for (const slot of slotsToDelete) {

  const appointmentsUsingSlot =
    await appointmentRepository.find({
      where: {
        recurringSlot: {
          id: slot.id,
        },
      },
      relations: {
        recurringSlot: true,
        recurringAvailability: true,
      },
    });

  for (const appointment of appointmentsUsingSlot) {

    if (appointment.status === 'BOOKED') {
      throw new BadRequestException(
        `Cannot delete slot ${slot.id}; booked appointment ${appointment.id} is still assigned.`,
      );
    }

    // CANCELLED / COMPLETED
    appointment.recurringSlot = null;
    appointment.recurringAvailability = null;

    await appointmentRepository.save(appointment);
  }
}

if (slotsToDelete.length) {
  await queryRunner.manager.remove(slotsToDelete);
}

      await queryRunner.commitTransaction();

      for (const notification of notifications) {
      try {
        await this.mailService
          .sendAppointmentRescheduledMail(
            notification.patientEmail,
            notification.patientFullName,
            notification.doctorFullName,
            notification.appointmentDate,
            notification.appointmentStartTime,
          );
      } catch (error) {
        this.logger.error(
          `Failed to send rescheduled appointment email to ${notification.patientEmail}`,
          error,
        );
      }
    }

      const updatedSlots = await this.customSlotRepository.find({
        where: {
          availability: {
            id: availability.id,
          },
        },
        order: {
          startTime: 'ASC',
        },
      });

      return {
        message: 'Availability shrinked successfully.',

        windowStartTime: newStart,

        windowEndTime: newEnd,

        data: updatedSlots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async shrinkRecurring(
    user: any,
    id: string,
    dto: ExpandShrinkAvailabilityDto,
  ) {
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const doctor = await this.getDoctor(user);

      const availability = await queryRunner.manager.findOne(
        this.recurringRepository.target,
        {
          where: { id },
          relations: {
            doctor: true,
          },
        },
      );

      if (!availability) {
        throw new NotFoundException('Availability not found.');
      }

      if (availability.doctor.id !== doctor.id) {
        throw new ForbiddenException('Not your availability.');
      }

      const newStart = dto.startTime ?? availability.startTime;
      const newEnd = dto.endTime ?? availability.endTime;

      this.validateTime(newStart, newEnd);

      const newStartMinutes = this.timeToMinutes(newStart);
      const newEndMinutes = this.timeToMinutes(newEnd);

      const oldStartMinutes = this.timeToMinutes(availability.startTime);
      const oldEndMinutes = this.timeToMinutes(availability.endTime);

      if (
        newStartMinutes === oldStartMinutes &&
        newEndMinutes === oldEndMinutes
      ) {
        throw new BadRequestException('No changes detected.');
      }

      if (newStartMinutes < oldStartMinutes || newEndMinutes > oldEndMinutes) {
        throw new BadRequestException('This is not a shrink operation.');
      }

      // STREAM

      if (availability.schedulingType === 'STREAM') {
        availability.startTime = newStart;
        availability.endTime = newEnd;

        await queryRunner.manager.save(availability);

        await queryRunner.commitTransaction();

        return {
          message: 'Availability shrinked successfully.',
          data: {
            startTime: newStart,
            endTime: newEnd,
          },
        };
      }

      // WAVE

      const recurringSlotRepository = queryRunner.manager.getRepository(
        this.recurringSlotRepository.target,
      );

      const appointmentRepository = queryRunner.manager.getRepository(
        this.appointmentRepository.target,
      );

      // Fetch slots belonging to this availability
      const slots = await recurringSlotRepository.find({
        where: {
          availability: {
            id: availability.id,
          },
        },
        order: {
          startTime: 'ASC',
        },
      });

      // Slots that will remain after shrink
      const availableSlots = slots.filter(
        (slot) =>
          !this.isOutsideRange(slot.startTime, slot.endTime, newStart, newEnd),
      );

      // Slots that must be removed
      const outsideSlots = slots.filter((slot) =>
        this.isOutsideRange(slot.startTime, slot.endTime, newStart, newEnd),
      );

      // Nothing to remove
      if (outsideSlots.length === 0) {
        availability.startTime = newStart;
        availability.endTime = newEnd;

        await queryRunner.manager.save(availability);

        await queryRunner.commitTransaction();

        return {
          message: 'Availability shrinked successfully.',
          window_startTime: newStart,
          window_endTime: newEnd,
          data: slots.map((slot) => ({
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        };
      }

      const outsideSlotIds = outsideSlots.map((slot) => slot.id);

      // FIND AFFECTED APPOINTMENTS

      const affectedAppointments = await appointmentRepository
  .createQueryBuilder('appointment')
  .leftJoinAndSelect('appointment.recurringSlot', 'recurringSlot')
  .leftJoinAndSelect('appointment.patient', 'patient')
  .leftJoinAndSelect('appointment.doctor', 'doctor')
  .where('appointment.recurringSlotId IN (:...slotIds)', {
    slotIds: outsideSlotIds,
  })
  .andWhere('appointment.status = :status', {
    status: 'BOOKED',
  })
  .orderBy('appointment.appointmentDate', 'ASC')
  .getMany();

      // TEMPORARY RESERVATION SET

      const reserved = new Set<string>();

      const moves: any[] = [];
      
      const notifications: any[] = [];
      // RESCHEDULE EACH APPOINTMENT

      for (const appointment of affectedAppointments) {
        const appointmentDate = appointment.appointmentDate;

        let replacement: any = null;

        // 1. FIRST CHECK SAME DATE / SAME AVAILABILITY

        for (const slot of availableSlots) {
          const key = `${slot.id}-${appointmentDate}`;

          if (reserved.has(key)) {
            continue;
          }

          const booked = await appointmentRepository.findOne({
            where: {
              recurringSlot: {
                id: slot.id,
              },
              appointmentDate,
              status: 'BOOKED',
            },
          });

          if (!booked) {
            reserved.add(key);

            replacement = {
              appointmentDate,
              availability,
              slot,
              type: 'RECURRING',
            };

            break;
          }
        }

        // ----------------------------------------------
        // 2. SEARCH OTHER AVAILABILITIES
        // ----------------------------------------------

        if (!replacement) {
          replacement = await this.findNextAvailableSlot(
            doctor.id,
            appointmentDate,
            reserved,
            5,
            "RECURRING",
            availability.id,
            new Set(outsideSlotIds),
          );
        }

        // ----------------------------------------------
        // 3. NO REPLACEMENT
        // ----------------------------------------------

        if (!replacement) {
          throw new BadRequestException(
            `No appointment available for ${appointmentDate} within the next 5 days.`,
          );
        }

        moves.push({
          appointment,
          replacement,
        });
      }

      // --------------------------------------------------
      // APPLY MOVES
      // --------------------------------------------------

      for (const move of moves) {
        const appointment = move.appointment;
        const replacement = move.replacement;

        if (replacement.type === 'CUSTOM') {
          appointment.customAvailability = replacement.availability;

          appointment.customSlot = replacement.slot;

          appointment.recurringAvailability = null;
          appointment.recurringSlot = null;

          replacement.slot.isBooked = true;

          await queryRunner.manager.save(replacement.slot);

        } else {
          appointment.recurringAvailability = replacement.availability;

          appointment.recurringSlot = replacement.slot;

          appointment.customAvailability = null;
          appointment.customSlot = null;
        }

        appointment.appointmentDate = replacement.appointmentDate;

        await appointmentRepository.save(appointment);

        const appointmentStartTime =
          appointment.customSlot?.startTime ||
          appointment.recurringSlot?.startTime ||
          appointment.recurringAvailability?.startTime ||
          appointment.customAvailability?.startTime;

        if (!appointmentStartTime) {
          throw new Error('Appointment start time could not be determined');
       }

        const appointmentEndTime = 
        appointment.customSlot?.endTime ||
        appointment.recurringSlot?.endTime ||
        appointment.recurringAvailability?.endTime ||
        appointment.customAvailability?.endTime;

       if (!appointmentEndTime) {
          throw new Error('Appointment end time could not be determined');
       }

        //Notification message
        const notificationMessage =
        `Your appointment has been rescheduled to ` +
        `${appointment.appointmentDate} from ` +
        `${appointmentStartTime} to ${appointmentEndTime}.`;

        await this.createNotification(
          queryRunner.manager,
          appointment.patient.id,
          "APPOINTMENT_RESCHEDULED",
          'Appointment rescheduled',
          notificationMessage,
          appointment.id
        );

        notifications.push({
          patientEmail : appointment.patient.email,
          patientFullName : appointment.patient.fullName,
          doctorFullName : appointment.doctor.fullName,
          appointmentDate : appointment.appointmentDate,
          appointmentStartTime
        })
      }

      // CRITICAL SAFETY CHECK AND DELETE APPOINTMENTS HAVING STATUS AS BOOKED OR COMPLETED

      const appointmentRepo =
  queryRunner.manager.getRepository(Appointment);

for (const slot of outsideSlots) {
  const appointmentsUsingSlot =
    await appointmentRepo.find({
      where: {
        recurringSlot: {
          id: slot.id,
        },
      },
    });

  for (const appointment of appointmentsUsingSlot) {
    if (appointment.status === 'BOOKED') {
      throw new BadRequestException(
        `Cannot delete slot ${slot.id}; booked appointment ${appointment.id} is still assigned.`,
      );
    }

    // CANCELLED / COMPLETED
    appointment.recurringSlot = null;
    appointment.recurringAvailability = null;

    await appointmentRepo.save(appointment);
  }
}

// DELETE OUTSIDE SLOTS
if (outsideSlots.length > 0) {
  await recurringSlotRepository.remove(outsideSlots);
}

      // UPDATE AVAILABILITY

      availability.startTime = newStart;
      availability.endTime = newEnd;

      await queryRunner.manager.save(availability);

      // COMMIT

      await queryRunner.commitTransaction();

      for (const notification of notifications) {
      try {
        await this.mailService
          .sendAppointmentRescheduledMail(
            notification.patientEmail,
            notification.patientFullName,
            notification.doctorFullName,
            notification.appointmentDate,
            notification.appointmentStartTime,
          );
      } catch (error) {
        this.logger.error(
          `Failed to send rescheduled appointment email to ${notification.patientEmail}`,
          error,
        );
      }
    }
      const updatedSlots = await recurringSlotRepository.find({
        where: {
          availability: {
            id: availability.id,
          },
        },
        order: {
          startTime: 'ASC',
        },
      });

      return {
        message: 'Availability shrinked successfully.',
        window_startTime: newStart,
        window_endTime: newEnd,
        data: updatedSlots.map((slot) => ({
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      };
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }

      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createRecurring(user: any, dto: CreateRecurringAvailabilityDto) {
    const doctor = await this.getDoctor(user);

    // Validate timings
    this.validateTime(dto.startTime, dto.endTime);

    // Validate scheduling type
    this.validateScheduling(dto);

    // STREAM validations
    if (dto.schedulingType === 'WAVE') {
      this.validateDuration(dto.startTime, dto.endTime, dto.duration!);
    }

    // Check overlapping availability
    const existingSlots = await this.recurringRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        dayOfWeek: dto.dayOfWeek,
      },
    });

    for (const slot of existingSlots) {
      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(dto.startTime);
      const newEndMinutes = this.timeToMinutes(dto.endTime);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Availability overlaps with an existing slot.',
        );
      }
    }

    // Create availability
    const availability = this.recurringRepository.create({
      doctor,
      ...dto,
    });

    const saved = await this.recurringRepository.save(availability);

    // Generate slots only for WAVE scheduling
    if (saved.schedulingType === 'WAVE') {
      await this.generateSlots(saved, this.recurringSlotRepository);
    }

    return {
      message: 'Recurring availability created successfully.',
      data: {
        id: saved.id,
        dayOfWeek: saved.dayOfWeek,
        schedulingType: saved.schedulingType,
        startTime: saved.startTime,
        endTime: saved.endTime,
        duration: saved.duration,
        bufferTime: saved.bufferTime,
        maxCapacity: saved.maxCapacity,
      },
    };
  }

  async updateRecurring(
    user: any,
    id: string,
    dto: UpdateRecurringAvailabilityDto,
  ) {
    const doctor = await this.getDoctor(user);

    const availability = await this.recurringRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
    });

    if (!availability) {
      throw new NotFoundException('Recurring availability not found.');
    }

    // Merge updated values
    Object.assign(availability, dto);

    // Validate time
    this.validateTime(availability.startTime, availability.endTime);

    // Validate scheduling type
    this.validateScheduling(availability);

    // STREAM
    // Time window + maximum patient capacity
    if (availability.schedulingType === 'STREAM') {
      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException(
          'Maximum capacity must be greater than 0 for STREAM scheduling.',
        );
      }
    }

    // WAVE
    // Exact slots + duration + optional buffer
    if (availability.schedulingType === 'WAVE') {
      if (!availability.duration || availability.duration <= 0) {
        throw new BadRequestException(
          'Duration must be greater than 0 for WAVE scheduling.',
        );
      }

      this.validateDuration(
        availability.startTime,
        availability.endTime,
        availability.duration,
      );

      // Buffer is optional
      if (
        availability.bufferTime !== null &&
        availability.bufferTime !== undefined &&
        availability.bufferTime < 0
      ) {
        throw new BadRequestException('Buffer time cannot be negative.');
      }
    }

    // Check overlapping recurring availability
    const existingSlots = await this.recurringRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        dayOfWeek: availability.dayOfWeek,
      },
    });

    for (const slot of existingSlots) {
      // Ignore current availability
      if (slot.id === availability.id) {
        continue;
      }

      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(availability.startTime);
      const newEndMinutes = this.timeToMinutes(availability.endTime);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Availability overlaps with an existing availabilities.',
        );
      }
    }

    // Save updated availability
    const updated = await this.recurringRepository.save(availability);

    // Remove old generated slots
    await this.recurringSlotRepository.delete({
      availability: {
        id: updated.id,
      },
    });

    // Generate exact slots only for WAVE
    if (updated.schedulingType === 'WAVE') {
      await this.generateSlots(updated, this.recurringSlotRepository);
    }

    return {
      message: 'Recurring availability updated successfully.',

      data: {
        id: updated.id,
        dayOfWeek: updated.dayOfWeek,
        schedulingType: updated.schedulingType,
        startTime: updated.startTime,
        endTime: updated.endTime,
        duration: updated.duration,
        bufferTime: updated.bufferTime,
        maxCapacity: updated.maxCapacity,
      },
    };
  }

  async getAvailability(user: any) {
  const doctor = await this.getDoctor(user);

  // Fetch recurring availability
  const recurringAvailability = await this.recurringRepository.find({
    where: {
      doctor: {
        id: doctor.id,
      },
    },
    order: {
      dayOfWeek: 'ASC',
      startTime: 'ASC',
    },
  });

  // Fetch custom availability
  const customAvailability = await this.customRepository.find({
    where: {
      doctor: {
        id: doctor.id,
      },
    },
    order: {
      date: 'ASC',
      startTime: 'ASC',
    },
  });

  return {
    message: 'Availability fetched successfully.',
    count: recurringAvailability.length + customAvailability.length,

    data: {
      recurring: recurringAvailability.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        schedulingType: slot.schedulingType,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: slot.duration,
        bufferTime: slot.bufferTime,
        maxCapacity: slot.maxCapacity,
      })),

      custom: customAvailability.map((slot) => ({
        id: slot.id,
        date: slot.date,
        schedulingType: slot.schedulingType,
        startTime: slot.startTime,
        endTime: slot.endTime,
        duration: slot.duration,
        bufferTime: slot.bufferTime,
        maxCapacity: slot.maxCapacity,
      })),
    },
  };
}

  async deleteRecurring(user: any, id: string) {
    const doctor = await this.getDoctor(user);

    const availability = await this.recurringRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
    });

    if (!availability) {
      throw new NotFoundException('Recurring availability not found.');
    }

    // Delete generated slots first
    await this.recurringSlotRepository.delete({
      availability: {
        id: availability.id,
      },
    });

    // Delete availability
    await this.recurringRepository.remove(availability);

    return {
      message: 'Recurring availability deleted successfully.',
    };
  }

  async createOverride(user: any, dto: CreateCustomAvailabilityDto) {
    const doctor = await this.getDoctor(user);

    // Validate date
    this.validateCustomDate(dto.date);

    // Validate time
    this.validateTime(dto.startTime, dto.endTime);

    // Validate scheduling type
    this.validateScheduling(dto);

    // Validate duration only for WAVE
    if (dto.schedulingType === 'WAVE') {
      this.validateDuration(dto.startTime, dto.endTime, dto.duration!);
    }

    // Check duplicate availability
    const duplicate = await this.customRepository.findOne({
      where: {
        doctor: {
          id: doctor.id,
        },

        date: dto.date,

        startTime: dto.startTime,

        endTime: dto.endTime,
      },
    });

    if (duplicate) {
      throw new BadRequestException('Custom availability already exists.');
    }

    // Check overlapping availability
    const existing = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },

        date: dto.date,
      },
    });

    for (const slot of existing) {
      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(dto.startTime);
      const newEndMinutes = this.timeToMinutes(dto.endTime);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Availability overlaps with an existing slot.',
        );
      }
    }

    // Create availability
    const availability = this.customRepository.create({
      doctor,

      ...dto,

      bookedPatients: 0,
    });

    const saved = await this.customRepository.save(availability);

    // Generate stream slots
    if (saved.schedulingType === 'WAVE') {
      await this.generateSlots(saved, this.customSlotRepository);
    }

    return {
      message: 'Custom availability created successfully.',
      data: {
        id: saved.id,
        date: saved.date,
        schedulingType: saved.schedulingType,
        startTime: saved.startTime,
        endTime: saved.endTime,
        duration: saved.duration,
        bufferTime: saved.bufferTime,
        maxCapacity: saved.maxCapacity,
      },
    };
  }

  async updateOverride(
    user: any,
    id: string,
    dto: UpdateCustomAvailabilityDto,
  ) {
    const doctor = await this.getDoctor(user);

    const availability = await this.customRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
    });

    if (!availability) {
      throw new NotFoundException('Custom availability not found.');
    }

    // Merge new values
    Object.assign(availability, dto);

    // Validate date
    if (!availability.date) {
      throw new BadRequestException('Date is required.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const selectedDate = new Date(availability.date);
    selectedDate.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      throw new BadRequestException(
        'Cannot update availability for a past date.',
      );
    }

    // Validate time
    this.validateTime(availability.startTime, availability.endTime);

    // Validate scheduling type
    this.validateScheduling(availability);

    // STREAM
    // Time window + capacity + token
    if (availability.schedulingType === 'STREAM') {
      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException(
          'Maximum capacity must be greater than 0 for STREAM scheduling.',
        );
      }
    }

    // WAVE
    // Exact slots + duration + buffer
    if (availability.schedulingType === 'WAVE') {
      if (!availability.duration || availability.duration <= 0) {
        throw new BadRequestException(
          'Duration must be greater than 0 for WAVE scheduling.',
        );
      }

      this.validateDuration(
        availability.startTime,
        availability.endTime,
        availability.duration,
      );

      if (
        availability.bufferTime !== null &&
        availability.bufferTime !== undefined &&
        availability.bufferTime < 0
      ) {
        throw new BadRequestException('Buffer time cannot be negative.');
      }
    }

    // Check duplicate availability
    const duplicate = await this.customRepository.findOne({
      where: {
        doctor: {
          id: doctor.id,
        },
        date: availability.date,
        startTime: availability.startTime,
        endTime: availability.endTime,
      },
    });

    if (duplicate && duplicate.id !== availability.id) {
      throw new BadRequestException('Custom availability already exists.');
    }

    // Check overlapping availability
    const existing = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        date: availability.date,
      },
    });

    for (const slot of existing) {
      if (slot.id === availability.id) {
        continue;
      }

      const existingStartMinutes = this.timeToMinutes(slot.startTime);
      const existingEndMinutes = this.timeToMinutes(slot.endTime);

      const newStartMinutes = this.timeToMinutes(availability.startTime);
      const newEndMinutes = this.timeToMinutes(availability.endTime);
      if (
        this.isOverlapping(
          existingStartMinutes,
          existingEndMinutes,
          newStartMinutes,
          newEndMinutes,
        )
      ) {
        throw new BadRequestException(
          'Availability overlaps with an existing slot.',
        );
      }
    }

    // Save updated availability
    const updated = await this.customRepository.save(availability);

    // Remove old generated slots
    await this.customSlotRepository.delete({
      availability: {
        id: updated.id,
      },
    });

    // Generate exact slots only for WAVE
    if (updated.schedulingType === 'WAVE') {
      await this.generateSlots(updated, this.customSlotRepository);
    }

    return {
      message: 'Custom availability updated successfully.',

      data: {
        id: updated.id,
        date: updated.date,
        schedulingType: updated.schedulingType,
        startTime: updated.startTime,
        endTime: updated.endTime,
        duration: updated.duration,
        bufferTime: updated.bufferTime,
        maxCapacity: updated.maxCapacity,
      },
    };
  }
  async getAvailabilityByDate(user: any, date: string) {
    const doctor = await this.getDoctor(user);

    // Validate date
    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    const day = parsedDate
      .toLocaleDateString('en-US', {
        weekday: 'long',
      })
      .toUpperCase();

    // CUSTOM AVAILABILITY

    const custom = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        date,
      },
    });

    if (custom.length > 0) {
      const result: any[] = [];

      for (const availability of custom) {
        // WAVE = EXACT SLOT BASED

        if (availability.schedulingType === 'WAVE') {
          // Doctor should see BOTH booked and available slots
          const slots = await this.customSlotRepository.find({
            where: {
              availability: {
                id: availability.id,
              },
            },
            order: {
              startTime: 'ASC',
            },
          });

          result.push({
            type: 'WAVE',
            date,

            availabilityId: availability.id,

            timeWindow: `${availability.startTime}-${availability.endTime}`,

            slots: slots.map((slot) => ({
              slotId: slot.id,
              startTime: slot.startTime,
              endTime: slot.endTime,
              isBooked: slot.isBooked,
              status: slot.isBooked ? 'BOOKED' : 'AVAILABLE',
            })),
          });
        }

        // STREAM = TOKEN BASED
        else {
          result.push({
            type: 'STREAM',

            date,

            availabilityId: availability.id,

            timeWindow: `${availability.startTime}-${availability.endTime}`,

            capacity: availability.maxCapacity,

            booked: availability.bookedPatients,

            available: availability.maxCapacity - availability.bookedPatients,

            status:
              availability.bookedPatients >= availability.maxCapacity
                ? 'FULL'
                : 'AVAILABLE',
          });
        }
      }

      return {
        message: 'Doctor availability fetched successfully.',

        data: result,
      };
    }

    // RECURRING AVAILABILITY

    const recurring = await this.recurringRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },

        dayOfWeek: day,
      },
    });

    if (recurring.length === 0) {
      return {
        message: 'No availability found.',

        data: [],
      };
    }

    const result: any[] = [];

    for (const availability of recurring) {
      // WAVE = EXACT SLOT BASED

      if (availability.schedulingType === 'WAVE') {
        const slots = await this.recurringSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
          },

          order: {
            startTime: 'ASC',
          },
        });

        const slotData: any[] = [];

        for (const slot of slots) {
          // Check booking only for this particular date
          const booked = await this.appointmentRepository.findOne({
            where: {
              recurringSlot: {
                id: slot.id,
              },

              appointmentDate: date,

              status: 'BOOKED',
            },
          });

          slotData.push({
            slotId: slot.id,

            startTime: slot.startTime,

            endTime: slot.endTime,

            isBooked: !!booked,

            status: booked ? 'BOOKED' : 'AVAILABLE',
          });
        }

        result.push({
          type: 'WAVE',

          date,

          dayOfWeek: day,

          availabilityId: availability.id,

          timeWindow: `${availability.startTime}-${availability.endTime}`,

          slots: slotData,
        });
      }

      // STREAM = TOKEN BASED
      else {
        // For recurring availability, calculate bookings for THIS PARTICULAR DATE.
        const bookedCount = await this.appointmentRepository.count({
          where: {
            recurringAvailability: {
              id: availability.id,
            },

            appointmentDate: date,

            status: 'BOOKED',
          },
        });

        const maxCapacity = availability.maxCapacity ?? 0;

        result.push({
          type: 'STREAM',

          date,

          dayOfWeek: day,

          availabilityId: availability.id,

          timeWindow: `${availability.startTime}-${availability.endTime}`,

          capacity: maxCapacity,

          booked: bookedCount,

          available: maxCapacity - bookedCount,

          status: bookedCount >= maxCapacity ? 'FULL' : 'AVAILABLE',
        });
      }
    }

    return {
      message: 'Doctor availability fetched successfully.',

      data: result,
    };
  }
}
