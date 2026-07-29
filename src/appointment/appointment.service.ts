import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository} from 'typeorm';

import { CreateAppointmentDto } from './dto/create-appointment.dto';

import { Appointment } from './appointment.entity';
import { User } from 'src/auth/user.entity';
import { CustomSlot } from 'src/availability/custom-slot.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';

@Injectable()
export class AppointmentService {
    constructor(
        @InjectRepository(Appointment)
        private readonly appointmentRepository: Repository<Appointment>,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        @InjectRepository(CustomSlot)
        private readonly customSlotRepository: Repository<CustomSlot>,
         @InjectRepository(CustomAvailability)
        private readonly customRepository: Repository<CustomAvailability>,
        @InjectRepository(RecurringAvailability)
        private readonly recurringRepository: Repository<RecurringAvailability>,
         @InjectRepository(RecurringSlot)
        private readonly recurringSlotRepository: Repository<RecurringSlot>,
    ){}

//Validate appointment
 private validateAppointmentDate(date: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);

    if (bookingDate < today) {
      throw new BadRequestException('Cannot book appointment for a past date.');
    }
  }
  //Validate recurring day
  private validateRecurringDay(appointmentDate: string, dayOfWeek: string) {
    const day = new Date(appointmentDate)
      .toLocaleDateString('en-US', {
        weekday: 'long',
      })
      .toUpperCase();

    if (day !== dayOfWeek) {
      throw new BadRequestException(
        'Appointment date does not match recurring schedule.',
      );
    }
  }

  //Check duplicate booking
  private async checkDuplicateBooking(
    patientId: string,
    doctorId: string,
    appointmentDate: string,
  ) {
    const existing = await this.appointmentRepository.findOne({
      where: {
        patient: {
          id: patientId,
        },
        doctor: {
          id: doctorId,
        },
        appointmentDate,
        status: 'BOOKED',
      },
    });

    if (existing) {
      throw new BadRequestException(
        'You already have an appointment with this doctor on this date.',
      );
    }
  }

// Book appointment
async bookAppointment(user: any, dto: CreateAppointmentDto) {
    // PATIENT

    const patient = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    // DOCTOR

    const doctor = await this.userRepository.findOne({
      where: {
        id: dto.doctorId,
        role: 'DOCTOR',
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found.');
    }

    // VALIDATE DATE

    this.validateAppointmentDate(dto.appointmentDate);

    // ONLY ONE BOOKING TYPE

    const bookingTypes = [
      dto.customSlotId,
      dto.recurringSlotId,
      dto.customAvailabilityId,
      dto.recurringAvailabilityId,
    ].filter(Boolean);

    if (bookingTypes.length !== 1) {
      throw new BadRequestException('Provide exactly one booking type.');
    }

    // DUPLICATE PATIENT BOOKING

    await this.checkDuplicateBooking(
      patient.id,
      doctor.id,
      dto.appointmentDate,
    );

    // STREAM BOOKING

    // CUSTOM STREAM
    if (dto.customAvailabilityId) {
      const availability = await this.customRepository.findOne({
        where: {
          id: dto.customAvailabilityId,
        },
      });

      if (!availability) {
        throw new NotFoundException('Availability not found.');
      }

      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'This availability is not STREAM scheduling.',
        );
      }

      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match availability date.',
        );
      }

      // Validate capacity configuration
      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException('Invalid STREAM capacity.');
      }

      const bookedCount = availability.bookedPatients ?? 0;

      // Check capacity
      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('STREAM capacity is full.');
      }

      // Token
      const lastAppointment = await this.appointmentRepository.findOne({
        where: {
          recurringAvailability: {
            id: availability.id,
          },
          appointmentDate: dto.appointmentDate,
        },
        order: {
          tokenNumber: 'DESC',
        },
      });

      const tokenNumber = (lastAppointment?.tokenNumber ?? 0) + 1;

      availability.bookedPatients = tokenNumber;

      await this.customRepository.save(availability);

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        customAvailability: availability,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'STREAM',

        tokenNumber,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'STREAM appointment booked successfully.',

        data: {
          appointmentId: savedAppointment.id,

          doctorId: doctor.id,

          patientId: patient.id,

          appointmentDate: savedAppointment.appointmentDate,

          schedulingType: savedAppointment.schedulingType,

          timeWindow: `${availability.startTime} - ${availability.endTime}`,

          tokenNumber: savedAppointment.tokenNumber,

          status: savedAppointment.status,
        },
      };
    }

    // RECURRING STREAM
    if (dto.recurringAvailabilityId) {
      const availability = await this.recurringRepository.findOne({
        where: {
          id: dto.recurringAvailabilityId,
        },
      });

      if (!availability) {
        throw new NotFoundException('Availability not found.');
      }

      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'This availability is not STREAM scheduling.',
        );
      }

      // Check correct recurring day
      this.validateRecurringDay(dto.appointmentDate, availability.dayOfWeek);

      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException('Invalid STREAM capacity.');
      }

      // Count only bookings for this date. Do not use availability.bookedPatients
      const bookedCount = await this.appointmentRepository.count({
        where: {
          recurringAvailability: {
            id: availability.id,
          },

          appointmentDate: dto.appointmentDate,

          status: 'BOOKED',
        },
      });

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('STREAM capacity is full for this date.');
      }

      const tokenNumber = bookedCount + 1;

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        recurringAvailability: availability,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'STREAM',

        tokenNumber,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'STREAM appointment booked successfully.',

        data: {
          appointmentId: savedAppointment.id,

          doctorId: doctor.id,

          patientId: patient.id,

          appointmentDate: savedAppointment.appointmentDate,

          schedulingType: savedAppointment.schedulingType,

          timeWindow: `${availability.startTime} - ${availability.endTime}`,

          tokenNumber: savedAppointment.tokenNumber,

          status: savedAppointment.status,
        },
      };
    }

    // WAVE BOOKING

    // CUSTOM WAVE SLOT
    if (dto.customSlotId) {
      const slot = await this.customSlotRepository.findOne({
        where: {
          id: dto.customSlotId,
        },

        relations: {
          availability: true,
        },
      });

      if (!slot) {
        throw new NotFoundException('Slot not found.');
      }

      const availability = slot.availability;

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException('This slot is not WAVE scheduling.');
      }

      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match slot date.',
        );
      }

      // Exact slot already booked
      if (slot.isBooked) {
        throw new BadRequestException('This time slot is already booked.');
      }

      slot.isBooked = true;

      await this.customSlotRepository.save(slot);

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        customSlot: slot,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'WAVE',

        // No token for exact slot booking
        tokenNumber: undefined,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'WAVE appointment booked successfully.',

        data: {
          appointmentId: savedAppointment.id,

          doctorId: doctor.id,

          patientId: patient.id,

          appointmentDate: savedAppointment.appointmentDate,

          schedulingType: savedAppointment.schedulingType,

          startTime: slot.startTime,

          endTime: slot.endTime,

          tokenNumber: null,

          status: savedAppointment.status,
        },
      };
    }

    // RECURRING WAVE SLOT
    if (dto.recurringSlotId) {
      const slot = await this.recurringSlotRepository.findOne({
        where: {
          id: dto.recurringSlotId,
        },

        relations: {
          availability: true,
        },
      });

      if (!slot) {
        throw new NotFoundException('Slot not found.');
      }

      const availability = slot.availability;

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException('This slot is not WAVE scheduling.');
      }

      // Validate recurring date
      this.validateRecurringDay(dto.appointmentDate, availability.dayOfWeek);

      // A recurring slot can be booked once
      // PER DATE.
      const existingAppointment = await this.appointmentRepository.findOne({
        where: {
          recurringSlot: {
            id: slot.id,
          },

          appointmentDate: dto.appointmentDate,

          status: 'BOOKED',
        },
      });

      if (existingAppointment) {
        throw new BadRequestException(
          'This time slot is already booked for this date.',
        );
      }

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        recurringSlot: slot,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'WAVE',

        tokenNumber: undefined,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'WAVE appointment booked successfully.',

        data: {
          appointmentId: savedAppointment.id,

          doctorId: doctor.id,

          patientId: patient.id,

          appointmentDate: savedAppointment.appointmentDate,

          schedulingType: savedAppointment.schedulingType,

          startTime: slot.startTime,

          endTime: slot.endTime,

          tokenNumber: null,

          status: savedAppointment.status,
        },
      };
    }

    throw new BadRequestException('Invalid booking request.');
  }

//Get patient appointment bookings
async getMyAppointments(user: any) {
  const patient = await this.userRepository.findOne({
    where: {
      id: user.sub,
      role: 'PATIENT',
    },
  });

  if (!patient) {
    throw new NotFoundException(
      'Patient not found.',
    );
  }

  const appointments =
    await this.appointmentRepository.find({
      where: {
        patient: {
          id: patient.id,
        },
      },

      relations: {
        doctor: true,
        customSlot: true,
        recurringSlot: true,
        customAvailability: true,
        recurringAvailability: true,
      },

      order: {
        appointmentDate: 'ASC',
      },
    });

  if (appointments.length === 0) {
    return {
      message: 'No appointments found.',
      data: [],
    };
  }

  return {
    message: 'Appointments fetched successfully.',

    data: appointments.map((appointment) => {
      let startTime: string | null = null;
      let endTime: string | null = null;
      let timeWindow: string | null = null;

      // WAVE 
      if (appointment.schedulingType === 'WAVE') {

        if (appointment.customSlot) {
          startTime =
            appointment.customSlot.startTime;

          endTime =
            appointment.customSlot.endTime;
        }

        if (appointment.recurringSlot) {
          startTime =
            appointment.recurringSlot.startTime;

          endTime =
            appointment.recurringSlot.endTime;
        }
      }

      // STREAM
      if (appointment.schedulingType === 'STREAM') {

        if (appointment.customAvailability) {
          timeWindow =
            `${appointment.customAvailability.startTime} - ${appointment.customAvailability.endTime}`;
        }

        if (appointment.recurringAvailability) {
          timeWindow =
            `${appointment.recurringAvailability.startTime} - ${appointment.recurringAvailability.endTime}`;
        }
      }

      return {
        appointmentId: appointment.id,

        doctor: {
          id: appointment.doctor.id,
          fullName: appointment.doctor.fullName,
          email:
            appointment.doctor.email,
        },

        appointmentDate:
          appointment.appointmentDate,

        schedulingType:
          appointment.schedulingType,

        startTime,
        endTime,
        timeWindow,

        tokenNumber:
          appointment.tokenNumber ?? null,

        status:
          appointment.status,
      };
    }),
  };
}

//Cancel the appointment
async cancelAppointment(
  user: any,
  appointmentId: string,
) {
  const patient = await this.userRepository.findOne({
    where: {
      id: user.sub,
      role: 'PATIENT',
    },
  });

  if (!patient) {
    throw new NotFoundException(
      'Patient not found.',
    );
  }

  const appointment =
    await this.appointmentRepository.findOne({
      where: {
        id: appointmentId,
      },
      relations: {
        patient: true,
        customSlot: {
          availability: true,
        },
        recurringSlot: {
          availability: true,
        },
        customAvailability: true,
        recurringAvailability: true,
      },
    });

  if (!appointment) {
    throw new NotFoundException(
      'Appointment not found.',
    );
  }

  if (appointment.patient.id !== patient.id) {
    throw new ForbiddenException(
      'You are not authorized to cancel this appointment.',
    );
  }

  if (appointment.status === 'CANCELLED') {
    throw new BadRequestException(
      'Appointment is already cancelled.',
    );
  }

  const appointmentDate = new Date(
    appointment.appointmentDate,
  );

  if (isNaN(appointmentDate.getTime())) {
    throw new BadRequestException(
      'Invalid appointment date.',
    );
  }

  const today = new Date();

  today.setHours(0, 0, 0, 0);
  appointmentDate.setHours(0, 0, 0, 0);

  if (appointmentDate < today) {
    throw new BadRequestException(
      'Past appointments cannot be cancelled.',
    );
  }

  if (appointment.schedulingType === 'WAVE') {
    if (appointment.customSlot) {
      appointment.customSlot.isBooked = false;

      await this.customSlotRepository.save(
        appointment.customSlot,
      );
    }
  }

  if (appointment.schedulingType === 'STREAM') {
    if (appointment.customAvailability) {
      if (
        appointment.customAvailability.bookedPatients > 0
      ) {
        appointment.customAvailability.bookedPatients--;
      }

      await this.customRepository.save(
        appointment.customAvailability,
      );
    }
  }

  appointment.status = 'CANCELLED';

  const cancelled =
    await this.appointmentRepository.save(
      appointment,
    );

  return {
    message: 'Appointment cancelled successfully.',
    data: {
      appointmentId: cancelled.id,
      appointmentDate: cancelled.appointmentDate,
      schedulingType: cancelled.schedulingType,
      tokenNumber: cancelled.tokenNumber,
      status: cancelled.status,
    },
  };
}

//Get doctor appointments
async getDoctorAppointments(user: any) {
  const doctor = await this.userRepository.findOne({
    where: {
      id: user.sub,
      role: 'DOCTOR',
    },
  });

  if (!doctor) {
    throw new NotFoundException(
      'Doctor not found.',
    );
  }

  const appointments =
    await this.appointmentRepository.find({
      where: {
        doctor: {
          id: doctor.id,
        },
      },
      relations: {
        patient: true,
        customSlot: {
          availability: true,
        },
        recurringSlot: {
          availability: true,
        },
        customAvailability: true,
        recurringAvailability: true,
      },
      order: {
        appointmentDate: 'ASC',
      },
    });

  if (appointments.length === 0) {
    return {
      message: 'No appointments found.',
      data: [],
    };
  }

  return {
    message:
      'Doctor appointments fetched successfully.',

    data: appointments.map((appointment) => {
      let startTime: string | null = null;
      let endTime: string | null = null;

      let timeWindow: string | null = null;

      // WAVE  - exact appointment slot

      if (
        appointment.schedulingType === 'WAVE'
      ) {
        if (appointment.customSlot) {
          startTime =
            appointment.customSlot.startTime;

          endTime =
            appointment.customSlot.endTime;
        }

        if (appointment.recurringSlot) {
          startTime =
            appointment.recurringSlot.startTime;

          endTime =
            appointment.recurringSlot.endTime;
        }
      }

      // STREAM - Big time window + token

      if (
        appointment.schedulingType === 'STREAM'
      ) {
        if (appointment.customAvailability) {
          startTime =
            appointment.customAvailability.startTime;

          endTime =
            appointment.customAvailability.endTime;
        }

        if (appointment.recurringAvailability) {
          startTime =
            appointment.recurringAvailability.startTime;

          endTime =
            appointment.recurringAvailability.endTime;
        }

        timeWindow =
          `${startTime} - ${endTime}`;
      }

      // RESPONSE

      return {
        appointmentId: appointment.id,

        patient: {
          id: appointment.patient.id,
          fullName: appointment.patient.fullName,
          email: appointment.patient.email,
          mobileNumber:
            appointment.patient.mobileNumber,
        },

        appointmentDate:
          appointment.appointmentDate,

        schedulingType:
          appointment.schedulingType,

        // STREAM gets time window
        timeWindow,

        // WAVE gets exact slot
        startTime:
          appointment.schedulingType === 'WAVE'
            ? startTime
            : null,

        endTime:
          appointment.schedulingType === 'WAVE'
            ? endTime
            : null,

        // STREAM gets token
        tokenNumber:
          appointment.schedulingType === 'STREAM'
            ? appointment.tokenNumber
            : null,

        status:
          appointment.status,
      };
    }),
  };
}


}
