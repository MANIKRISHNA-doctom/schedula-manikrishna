import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { User } from 'src/auth/user.entity';

import { CustomSlot } from './custom-slot.entity';
import { RecurringSlot } from './recurring-slot.entity';
import { Appointment } from 'src/appointment_booking/appointment.entity';
import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';

import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
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

  private validateScheduling(dto: any) {
    if (dto.schedulingType === 'STREAM') {
      if (!dto.duration) {
        throw new BadRequestException(
          'Duration is required for STREAM scheduling.',
        );
      }

      if (dto.maxCapacity) {
        throw new BadRequestException(
          'maxCapacity is not allowed for STREAM scheduling.',
        );
      }
    }

    if (dto.schedulingType === 'WAVE') {
      if (!dto.maxCapacity) {
        throw new BadRequestException(
          'maxCapacity is required for WAVE scheduling.',
        );
      }

      if (dto.duration) {
        throw new BadRequestException(
          'Duration is not allowed for WAVE scheduling.',
        );
      }

      if (dto.bufferTime) {
        throw new BadRequestException(
          'Buffer time is not allowed for WAVE scheduling.',
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

    current +=
      availability.duration +
      (availability.bufferTime ?? 0);
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
    existingStart: string,
    existingEnd: string,
    newStart: string,
    newEnd: string,
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

  async createRecurring(
  user: any,
  dto: CreateRecurringAvailabilityDto,
) {

  const doctor = await this.getDoctor(user);

  // Validate timings
  this.validateTime(dto.startTime, dto.endTime);

  // Validate scheduling type
  this.validateScheduling(dto);

  // STREAM validations
  if (dto.schedulingType === 'STREAM') {
    this.validateDuration(
      dto.startTime,
      dto.endTime,
      dto.duration!,
    );
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
    if (
      this.isOverlapping(
        slot.startTime,
        slot.endTime,
        dto.startTime,
        dto.endTime,
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

  // Generate slots only for STREAM scheduling
  if (saved.schedulingType === 'STREAM') {
    await this.generateSlots(
      saved,
      this.recurringSlotRepository,
    );
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

  // Validate updated timings
  this.validateTime(
    availability.startTime,
    availability.endTime,
  );

  // Validate scheduling configuration
  this.validateScheduling(availability);

  // Validate duration only for STREAM
  if (availability.schedulingType === 'STREAM') {
    this.validateDuration(
      availability.startTime,
      availability.endTime,
      availability.duration,
    );
  }

  // Check overlapping slots
  const existingSlots = await this.recurringRepository.find({
    where: {
      doctor: {
        id: doctor.id,
      },
      dayOfWeek: availability.dayOfWeek,
    },
  });

  for (const slot of existingSlots) {
    if (slot.id === availability.id) {
      continue;
    }

    if (
      this.isOverlapping(
        slot.startTime,
        slot.endTime,
        availability.startTime,
        availability.endTime,
      )
    ) {
      throw new BadRequestException(
        'Availability overlaps with another slot.',
      );
    }
  }

  // Save updated availability
  const updated = await this.recurringRepository.save(availability);

  // Remove previously generated slots
  await this.recurringSlotRepository.delete({
    availability: {
      id: updated.id,
    },
  });

  // Regenerate slots only for STREAM
  if (updated.schedulingType === 'STREAM') {
    await this.generateSlots(
      updated,
      this.recurringSlotRepository,
    );
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

 async getRecurring(user: any) {
  const doctor = await this.getDoctor(user);

  const availability = await this.recurringRepository.find({
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

  return {
    message: 'Recurring availability fetched successfully.',
    count: availability.length,
    data: availability.map((slot) => ({
  id: slot.id,
  dayOfWeek: slot.dayOfWeek,
  schedulingType: slot.schedulingType,
  startTime: slot.startTime,
  endTime: slot.endTime,
  duration: slot.duration,
  bufferTime: slot.bufferTime,
  maxCapacity: slot.maxCapacity,
})),
  };
}

 async deleteRecurring(
  user: any,
  id: string,
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
    throw new NotFoundException(
      'Recurring availability not found.',
    );
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

  async createOverride(
  user: any,
  dto: CreateCustomAvailabilityDto,
) {

  const doctor = await this.getDoctor(user);

  // Validate time
  this.validateTime(
    dto.startTime,
    dto.endTime,
  );


  // Validate scheduling type
  this.validateScheduling(dto);


  // Validate duration only for STREAM
  if (dto.schedulingType === 'STREAM') {

    this.validateDuration(
      dto.startTime,
      dto.endTime,
      dto.duration!,
    );

  }


  // Check duplicate availability
  const duplicate =
    await this.customRepository.findOne({

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

    throw new BadRequestException(
      'Custom availability already exists.',
    );

  }


  // Check overlapping availability
  const existing =
    await this.customRepository.find({

      where: {
        doctor: {
          id: doctor.id,
        },

        date: dto.date,
      },

    });


  for (const slot of existing) {

    if (
      this.isOverlapping(
        slot.startTime,
        slot.endTime,
        dto.startTime,
        dto.endTime,
      )
    ) {

      throw new BadRequestException(
        'Availability overlaps with existing slot.',
      );

    }

  }



  // Create availability
  const availability =
    this.customRepository.create({

      doctor,

      ...dto,

      bookedPatients: 0,

    });


  const saved =
    await this.customRepository.save(
      availability,
    );


  // Generate stream slots
  if(saved.schedulingType === 'STREAM') {

    await this.generateSlots(
      saved,
      this.customSlotRepository,
    );

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

async getAvailabilityByDate(doctorId: string, date: string) {

  const day = new Date(date)
    .toLocaleDateString('en-US', {
      weekday: 'long',
    })
    .toUpperCase();

  // Check custom availability first
  const custom = await this.customRepository.find({
    where: {
      doctor: {
        id: doctorId,
      },
      date,
    },
  });

  if (custom.length > 0) {

    const result: any[] = [];

    for (const availability of custom) {

      // STREAM
      if (availability.schedulingType === 'STREAM') {

        const slots = await this.customSlotRepository.find({
          where: {
            availability: {
              id: availability.id,
            },
            isBooked: false,
          },
        });

        result.push({
          type: 'STREAM',
          date,
          slots: slots.map((slot) => ({
            slotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
        });

      }

      // WAVE
      else {

        result.push({
          type: 'WAVE',
          date,
          availabilityId: availability.id,
          timeWindow: `${availability.startTime}-${availability.endTime}`,
          capacity: availability.maxCapacity,
          available: `${availability.maxCapacity - availability.bookedPatients}/${availability.maxCapacity}`,
        });

      }
    }

    return {
      message: 'Doctor availability fetched successfully.',
      data: result,
    };
  }

  // Recurring availability
  const recurring = await this.recurringRepository.find({
    where: {
      doctor: {
        id: doctorId,
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

    // ================= STREAM =================

    if (availability.schedulingType === 'STREAM') {

      // Fetch all generated slots
      const slots = await this.recurringSlotRepository.find({
        where: {
          availability: {
            id: availability.id,
          },
        },
      });

      const availableSlots:any [] = [];

      for (const slot of slots) {

        const booked =
          await this.appointmentRepository.findOne({
            where: {
              recurringSlot: {
                id: slot.id,
              },
              appointmentDate: date,
              status: 'BOOKED',
            },
          });

        if (!booked) {

          availableSlots.push({
            slotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
          });

        }

      }

      result.push({
        type: 'STREAM',
        dayOfWeek: day,
        slots: availableSlots,
      });

    }

    // ================= WAVE =================

    else {

      const bookedCount =
        await this.appointmentRepository.count({
          where: {
            recurringAvailability: {
              id: availability.id,
            },
            appointmentDate: date,
            status: 'BOOKED',
          },
        });

      result.push({
        type: 'WAVE',
        dayOfWeek: day,
        availabilityId: availability.id,
        timeWindow: `${availability.startTime}-${availability.endTime}`,
        capacity: availability.maxCapacity,
        available: `${availability.maxCapacity - bookedCount}/${availability.maxCapacity}`,
      });

    }

  }

  return {
    message: 'Doctor availability fetched successfully.',
    data: result,
  };

}
}
