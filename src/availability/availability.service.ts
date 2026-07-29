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
import { Appointment } from 'src/appointment/appointment.entity';
import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';

import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';
import { UpdateCustomAvailabilityDto } from './dto/update-custom-availability.dto';

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
    if (dto.schedulingType === 'WAVE') {
      if (!dto.duration) {
        throw new BadRequestException(
          'Duration is required for WAVE scheduling.',
        );
      }

      if (dto.maxCapacity) {
        throw new BadRequestException(
          'maxCapacity is not allowed for WAVE scheduling.',
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

    current +=
      availability.duration +
      (availability.bufferTime ?? 0);
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
  if (dto.schedulingType === 'WAVE') {
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

  // Generate slots only for WAVE scheduling
  if (saved.schedulingType === 'WAVE') {
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
    throw new NotFoundException(
      'Recurring availability not found.',
    );
  }

  // Merge updated values
  Object.assign(availability, dto);

  // Validate time
  this.validateTime(
    availability.startTime,
    availability.endTime,
  );

  // Validate scheduling type
  this.validateScheduling(availability);

  // STREAM
  // Time window + maximum patient capacity
  if (availability.schedulingType === 'STREAM') {
    if (
      !availability.maxCapacity ||
      availability.maxCapacity <= 0
    ) {
      throw new BadRequestException(
        'Maximum capacity must be greater than 0 for STREAM scheduling.',
      );
    }
  }

  // WAVE
  // Exact slots + duration + optional buffer
  if (availability.schedulingType === 'WAVE') {
    if (
      !availability.duration ||
      availability.duration <= 0
    ) {
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
      throw new BadRequestException(
        'Buffer time cannot be negative.',
      );
    }

  }

  // Check overlapping recurring availability
  const existingSlots =
    await this.recurringRepository.find({
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
  const updated =
    await this.recurringRepository.save(
      availability,
    );

  // Remove old generated slots
  await this.recurringSlotRepository.delete({
    availability: {
      id: updated.id,
    },
  });

  // Generate exact slots only for WAVE
  if (updated.schedulingType === 'WAVE') {
    await this.generateSlots(
      updated,
      this.recurringSlotRepository,
    );
  }

  return {
    message:
      'Recurring availability updated successfully.',

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

  // Validate date
this.validateCustomDate(dto.date);

  // Validate time
  this.validateTime(
    dto.startTime,
    dto.endTime,
  );


  // Validate scheduling type
  this.validateScheduling(dto); 


  // Validate duration only for WAVE
  if (dto.schedulingType === 'WAVE') {

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
  if(saved.schedulingType === 'WAVE') {

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

async updateOverride(
  user: any,
  id: string,
  dto: UpdateCustomAvailabilityDto,
) {
  const doctor = await this.getDoctor(user);

  const availability =
    await this.customRepository.findOne({
      where: {
        id,
        doctor: {
          id: doctor.id,
        },
      },
    });

  if (!availability) {
    throw new NotFoundException(
      'Custom availability not found.',
    );
  }

  // Merge new values
  Object.assign(availability, dto);

  // Validate date
  if (!availability.date) {
    throw new BadRequestException(
      'Date is required.',
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const selectedDate = new Date(
    availability.date,
  );
  selectedDate.setHours(0, 0, 0, 0);

  if (selectedDate < today) {
    throw new BadRequestException(
      'Cannot update availability for a past date.',
    );
  }

  // Validate time
  this.validateTime(
    availability.startTime,
    availability.endTime,
  );

  // Validate scheduling type
  this.validateScheduling(availability);

  // STREAM
  // Time window + capacity + token
  if (
    availability.schedulingType === 'STREAM'
  ) {
    if (
      !availability.maxCapacity ||
      availability.maxCapacity <= 0
    ) {
      throw new BadRequestException(
        'Maximum capacity must be greater than 0 for STREAM scheduling.',
      );
    }
  }

  // WAVE
  // Exact slots + duration + buffer
  if (
    availability.schedulingType === 'WAVE'
  ) {
    if (
      !availability.duration ||
      availability.duration <= 0
    ) {
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
      throw new BadRequestException(
        'Buffer time cannot be negative.',
      );
    }
  }

  // Check duplicate availability
  const duplicate =
    await this.customRepository.findOne({
      where: {
        doctor: {
          id: doctor.id,
        },
        date: availability.date,
        startTime: availability.startTime,
        endTime: availability.endTime,
      },
    });

  if (
    duplicate &&
    duplicate.id !== availability.id
  ) {
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
        date: availability.date,
      },
    });

  for (const slot of existing) {
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
  const updated =
    await this.customRepository.save(
      availability,
    );

  // Remove old generated slots
  await this.customSlotRepository.delete({
    availability: {
      id: updated.id,
    },
  });

  // Generate exact slots only for WAVE
  if (
    updated.schedulingType === 'WAVE'
  ) {
    await this.generateSlots(
      updated,
      this.customSlotRepository,
    );
  }

  return {
    message:
      'Custom availability updated successfully.',

    data: {
      id: updated.id,
      date: updated.date,
      schedulingType:
        updated.schedulingType,
      startTime: updated.startTime,
      endTime: updated.endTime,
      duration: updated.duration,
      bufferTime: updated.bufferTime,
      maxCapacity:
        updated.maxCapacity,
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

          timeWindow:
            `${availability.startTime}-${availability.endTime}`,

          slots: slots.map((slot) => ({
            slotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
            isBooked: slot.isBooked,
            status: slot.isBooked
              ? 'BOOKED'
              : 'AVAILABLE',
          })),
        });

      }

      // STREAM = TOKEN BASED

      else {

        result.push({
          type: 'STREAM',

          date,

          availabilityId: availability.id,

          timeWindow:
            `${availability.startTime}-${availability.endTime}`,

          capacity: availability.maxCapacity,

          booked:
            availability.bookedPatients,

          available:
            availability.maxCapacity -
            availability.bookedPatients,

          status:
            availability.bookedPatients >=
            availability.maxCapacity
              ? 'FULL'
              : 'AVAILABLE',
        });

      }
    }

    return {
      message:
        'Doctor availability fetched successfully.',

      data: result,
    };
  }


  // RECURRING AVAILABILITY

  const recurring =
    await this.recurringRepository.find({
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

      const slots =
        await this.recurringSlotRepository.find({
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


        slotData.push({

          slotId: slot.id,

          startTime: slot.startTime,

          endTime: slot.endTime,

          isBooked: !!booked,

          status: booked
            ? 'BOOKED'
            : 'AVAILABLE',

        });

      }


      result.push({

        type: 'WAVE',

        date,

        dayOfWeek: day,

        availabilityId:
          availability.id,

        timeWindow:
          `${availability.startTime}-${availability.endTime}`,

        slots: slotData,

      });

    }


    // STREAM = TOKEN BASED

    else {

      // For recurring availability, calculate bookings for THIS PARTICULAR DATE.
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


      const maxCapacity =
        availability.maxCapacity ?? 0;


      result.push({

        type: 'STREAM',

        date,

        dayOfWeek: day,

        availabilityId:
          availability.id,

        timeWindow:
          `${availability.startTime}-${availability.endTime}`,

        capacity: maxCapacity,

        booked: bookedCount,

        available:
          maxCapacity - bookedCount,

        status:
          bookedCount >= maxCapacity
            ? 'FULL'
            : 'AVAILABLE',

      });

    }

  }


  return {

    message:
      'Doctor availability fetched successfully.',

    data: result,

  };

}
}
