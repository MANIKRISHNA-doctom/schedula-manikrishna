import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';

import { Repository } from 'typeorm';

import { User } from 'src/auth/user.entity';

import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';

import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';

@Injectable()
export class AvailabilityService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(RecurringAvailability)
    private readonly recurringRepository: Repository<RecurringAvailability>,

    @InjectRepository(CustomAvailability)
    private readonly customRepository: Repository<CustomAvailability>,
  ) {}

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

  private validateDuration(
 start:string,
 end:string,
 duration:number
){

 const startMinutes =
 Number(start.split(':')[0])*60 +
 Number(start.split(':')[1]);


 const endMinutes =
 Number(end.split(':')[0])*60 +
 Number(end.split(':')[1]);


 const total =
 endMinutes-startMinutes;


 if(duration > total){
   throw new BadRequestException(
    'Duration cannot exceed availability time'
   );
 }

}

  async createRecurring(user: any, dto: CreateRecurringAvailabilityDto) {

    

    const doctor = await this.getDoctor(user);

    this.validateTime(dto.startTime, dto.endTime);

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
          'Availability slot overlaps with existing slot.',
        );
      }
    }

    this.validateDuration(
        dto.startTime,
        dto.endTime,
        dto.duration
        );
    const availability = this.recurringRepository.create({
      doctor,
      ...dto,
    });

    const saved = await this.recurringRepository.save(availability);

    return {
      message: 'Recurring availability created successfully.',
      data: {
        id: saved.id,
        dayOfWeek: saved.dayOfWeek,
        startTime: saved.startTime,
        endTime: saved.endTime,
        capacity: saved.capacity,
        duration: saved.duration,
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
      data: availability.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        duration: slot.duration,
      })),
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
      throw new NotFoundException('Availability not found.');
    }

    // Apply updated values first
    Object.assign(availability, dto);

    // Validate updated time
    this.validateTime(availability.startTime, availability.endTime);

    //Validate duration time
    this.validateDuration(
 availability.startTime,
 availability.endTime,
 availability.duration
);

    const existingSlots = await this.recurringRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        dayOfWeek: availability.dayOfWeek,
      },
    });

    for (const slot of existingSlots) {
      // Ignore current slot
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

    const updated = await this.recurringRepository.save(availability);

    return {
      message: 'Availability updated successfully.',
      data: {
        id: updated.id,
        dayOfWeek: updated.dayOfWeek,
        startTime: updated.startTime,
        endTime: updated.endTime,
        capacity: updated.capacity,
        duration: updated.duration,
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
      throw new NotFoundException('Availability not found.');
    }

    await this.recurringRepository.delete({
      id,
    });

    return {
      message: 'Availability deleted successfully.',
    };
  }

  async createOverride(user: any, dto: CreateCustomAvailabilityDto) {
    // Validate time range
    this.validateTime(dto.startTime, dto.endTime);

    // Check doctor exists
    const doctor = await this.getDoctor(user);

    // Check duplicate entry
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

    // Check overlapping slots on the same date
    const existingSlots = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
        date: dto.date,
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
          'Availability overlaps with an existing time slot.',
        );
      }
    }

    //validate duration time
    this.validateDuration(
 dto.startTime,
 dto.endTime,
 dto.duration
);
    // Create override availability
    const availability = this.customRepository.create({
      doctor,

      ...dto,
    });

    // Save
    const savedAvailability = await this.customRepository.save(availability);

    return {
      message: 'Custom availability created successfully.',
      data: {
        id: savedAvailability.id,
        date: savedAvailability.date,
        startTime: savedAvailability.startTime,
        endTime: savedAvailability.endTime,
        capacity: savedAvailability.capacity,
        duration: savedAvailability.duration,
      },
    };
  }

  async getAvailabilityByDate(user: any, date: string) {
    const doctor = await this.getDoctor(user);

    const parsedDate = new Date(date);

    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid date.');
    }

    const custom = await this.customRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },

        date,
      },
    });

    if (custom.length > 0) {
      return {
        message: 'Custom availability found.',
        data: custom.map((slot) => ({
          id: slot.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          capacity: slot.capacity,
          duration: slot.duration,
        })),
      };
    }

    const day = parsedDate
      .toLocaleDateString('en-US', {
        weekday: 'long',
      })
      .toUpperCase();

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
        message: 'Doctor is unavailable on this date.',
        data: [],
      };
    }

    return {
      message: 'Recurring availability found.',
      data: recurring.map((slot) => ({
        id: slot.id,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        endTime: slot.endTime,
        capacity: slot.capacity,
        duration: slot.duration,
      })),
    };
  }
}
