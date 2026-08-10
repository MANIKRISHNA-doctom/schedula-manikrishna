import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

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
  ) {}

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

  //Release old booking
  private async releaseOldBooking(appointment: Appointment) {
    // WAVE = exact slot
    if (appointment.schedulingType === 'WAVE' && appointment.customSlot) {
      appointment.customSlot.isBooked = false;

      await this.customSlotRepository.save(appointment.customSlot);
    }
    if (
      appointment.customAvailability &&
      appointment.schedulingType === 'STREAM'
    ) {
      appointment.customAvailability.bookedPatients -= 1;

      if (appointment.customAvailability.bookedPatients < 0) {
        appointment.customAvailability.bookedPatients = 0;
      }

      await this.customRepository.save(appointment.customAvailability);
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
        throw new BadRequestException(' capacity is full.');
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

      availability.bookedPatients = bookedCount + 1;

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
        message: 'Appointment booked successfully.',

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

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('STREAM capacity is full for this date.');
      }

      // Find the last assigned token for this date
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
        message: 'Appointment booked successfully.',

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

      const bookedCount = await this.appointmentRepository.count({
        where: {
          customSlot: {
            availability: {
              id: availability.id,
            },
          },
          appointmentDate: dto.appointmentDate,
          status: 'BOOKED',
        },
      });

      if (availability.maxCapacity && bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('Maximum booking capacity reached.');
      }

      slot.isBooked = true;

      availability.bookedPatients++;

      await this.customSlotRepository.save(slot);

      await this.customRepository.save(availability);

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        customSlot: slot,

        customAvailability: availability,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'WAVE',

        // No token for exact slot booking
        tokenNumber: undefined,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment booked successfully.',

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

      // A recurring slot can be booked once PER DATE.
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

      const bookedCount = await this.appointmentRepository.count({
        where: {
          recurringSlot: {
            availability: {
              id: availability.id,
            },
          },
          appointmentDate: dto.appointmentDate,
          status: 'BOOKED',
        },
      });

      if (availability.maxCapacity && bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('Maximum booking capacity reached.');
      }

      const appointment = this.appointmentRepository.create({
        patient,
        doctor,

        recurringSlot: slot,

        recurringAvailability: availability,

        appointmentDate: dto.appointmentDate,

        schedulingType: 'WAVE',

        tokenNumber: undefined,

        status: 'BOOKED',
      });

      const savedAppointment =
        await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment booked successfully.',

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
      throw new NotFoundException('Patient not found.');
    }

    const appointments = await this.appointmentRepository.find({
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
            startTime = appointment.customSlot.startTime;

            endTime = appointment.customSlot.endTime;
          }

          if (appointment.recurringSlot) {
            startTime = appointment.recurringSlot.startTime;

            endTime = appointment.recurringSlot.endTime;
          }
        }

        // STREAM
        if (appointment.schedulingType === 'STREAM') {
          if (appointment.customAvailability) {
            timeWindow = `${appointment.customAvailability.startTime} - ${appointment.customAvailability.endTime}`;
          }

          if (appointment.recurringAvailability) {
            timeWindow = `${appointment.recurringAvailability.startTime} - ${appointment.recurringAvailability.endTime}`;
          }
        }

        return {
          appointmentId: appointment.id,

          doctor: {
            fullName: appointment.doctor.fullName,
            email: appointment.doctor.email,
          },

          appointmentDate: appointment.appointmentDate,

          schedulingType: appointment.schedulingType,

          startTime,
          endTime,
          timeWindow,

          tokenNumber: appointment.tokenNumber ?? null,

          status: appointment.status,
        };
      }),
    };
  }

  //Reschedule the appointment (Patient)
  async rescheduleAppointment(
    user: any,
    appointmentId: string,
    dto: RescheduleAppointmentDto,
  ) {
    // 1. Find patient

    const patient = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }
    // 2. Find existing appointment
    const appointment = await this.appointmentRepository.findOne({
      where: {
        id: appointmentId,
      },
      relations: {
        patient: true,
        doctor: true,
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
      throw new NotFoundException('Appointment not found.');
    }

    // 3. Check appointment owner

    if (appointment.patient.id !== patient.id) {
      throw new ForbiddenException(
        'You are not authorized to reschedule this appointment.',
      );
    }

    // 4. Appointment must be BOOKED

    if (appointment.status !== 'BOOKED') {
      throw new BadRequestException(
        'Only booked appointments can be rescheduled.',
      );
    }

    // 5. Validate target booking type

    const bookingTypes = [
      dto.customSlotId,
      dto.recurringSlotId,
      dto.customAvailabilityId,
      dto.recurringAvailabilityId,
    ].filter(Boolean);

    if (bookingTypes.length !== 1) {
      throw new BadRequestException('Provide exactly one new booking type.');
    }

    // 6. Validate new date

    this.validateAppointmentDate(dto.appointmentDate);

    // 7. Existing appointment should not be past

    const oldDate = new Date(appointment.appointmentDate);

    if (isNaN(oldDate.getTime())) {
      throw new BadRequestException('Invalid existing appointment date.');
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    oldDate.setHours(0, 0, 0, 0);

    if (oldDate < today) {
      throw new BadRequestException('Past appointments cannot be rescheduled.');
    }

    // WAVE = EXACT SLOT
    // 8.Custom exact slot

    if (dto.customSlotId) {
      const newSlot = await this.customSlotRepository.findOne({
        where: {
          id: dto.customSlotId,
        },
        relations: {
          availability: true,
        },
      });

      if (!newSlot) {
        throw new NotFoundException('New slot not found.');
      }

      const availability = newSlot.availability;

      // Doctor validation
      if (availability.doctor?.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New slot does not belong to this doctor.',
        );
      }

      // Must be WAVE because WAVE = exact slot
      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'Selected availability is not an exact-slot schedule.',
        );
      }

      // Date must match custom availability
      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match the selected slot.',
        );
      }

      // Same appointment target
      if (
        appointment.customSlot?.id === newSlot.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException('You are already booked for this slot.');
      }

      // Slot availability
      if (newSlot.isBooked) {
        throw new BadRequestException('Selected slot is already booked.');
      }

      const totalBooked = await this.customSlotRepository.count({
        where: {
          availability: {
            id: availability.id,
          },
          isBooked: true,
        },
      });

      if (availability.maxCapacity && totalBooked >= availability.maxCapacity) {
        throw new BadRequestException('Capacity is full.');
      }
      await this.releaseOldBooking(appointment);

      newSlot.isBooked = true;

      availability.bookedPatients++;
      await this.customRepository.save(availability);

      await this.customSlotRepository.save(newSlot);

      appointment.customSlot = newSlot;
      appointment.recurringSlot = null;
      appointment.customAvailability = newSlot.availability;
      appointment.recurringAvailability = null;

      appointment.appointmentDate = dto.appointmentDate;

      appointment.schedulingType = 'WAVE';
      appointment.status = 'BOOKED';

      const updated = await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment rescheduled successfully.',
        data: {
          appointmentDate: updated.appointmentDate,
          startTime: newSlot.startTime,
          endTime: newSlot.endTime,
          schedulingType: updated.schedulingType,
          status: updated.status,
        },
      };
    }

    // 9. Recurring exact slot

    if (dto.recurringSlotId) {
      const newSlot = await this.recurringSlotRepository.findOne({
        where: {
          id: dto.recurringSlotId,
        },
        relations: {
          availability: true,
        },
      });

      if (!newSlot) {
        throw new NotFoundException('New slot not found.');
      }

      const availability = newSlot.availability;

      // Doctor validation
      if (availability.doctor.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New slot does not belong to this doctor.',
        );
      }

      // WAVE = exact slot
      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'Selected availability is not an exact-slot schedule.',
        );
      }

      // Validate recurring day
      this.validateRecurringDay(dto.appointmentDate, availability.dayOfWeek);

      // Check same slot for same date
      if (
        appointment.recurringSlot?.id === newSlot.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException('You are already booked for this slot.');
      }

      const bookedSlots = await this.appointmentRepository.count({
        where: {
          recurringSlot: {
            availability: {
              id: availability.id,
            },
          },
          appointmentDate: dto.appointmentDate,
          status: 'BOOKED',
        },
      });

      if (availability.maxCapacity && bookedSlots >= availability.maxCapacity) {
        throw new BadRequestException('Wave capacity is full.');
      }

      // Check if slot is booked for selected date
      const existingBooking = await this.appointmentRepository.findOne({
        where: {
          recurringSlot: {
            id: newSlot.id,
          },
          appointmentDate: dto.appointmentDate,
          status: 'BOOKED',
        },
      });

      if (existingBooking) {
        throw new BadRequestException(
          'Selected slot is already booked for this date.',
        );
      }

      // Release old booking
      await this.releaseOldBooking(appointment);

      appointment.customSlot = null;
      appointment.recurringSlot = newSlot;
      appointment.customAvailability = null;
      appointment.recurringAvailability = availability;

      appointment.appointmentDate = dto.appointmentDate;

      appointment.schedulingType = 'WAVE';
      appointment.status = 'BOOKED';

      const updated = await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment rescheduled successfully.',
        data: {
          appointmentDate: updated.appointmentDate,
          startTime: newSlot.startTime,
          endTime: newSlot.endTime,
          schedulingType: updated.schedulingType,
          status: updated.status,
        },
      };
    }

    // STREAM = TOKEN BASED
    // CUSTOM AVAILABILITY

    if (dto.customAvailabilityId) {
      const availability = await this.customRepository.findOne({
        where: {
          id: dto.customAvailabilityId,
        },
        relations: {
          doctor: true,
        },
      });

      if (!availability) {
        throw new NotFoundException('New availability not found.');
      }

      // Make sure availability belongs to same doctor
      if (availability.doctor.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New availability does not belong to this doctor.',
        );
      }

      // STREAM = token based
      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'Selected availability is not token-based scheduling.',
        );
      }

      // Custom availability is for one specific date
      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match availability.',
        );
      }

      // Prevent same availability/date
      if (
        appointment.customAvailability?.id === availability.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked in this time window.',
        );
      }

      // Validate capacity
      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException('Invalid availability capacity.');
      }

      // -----------------------------------------
      // Count currently BOOKED patients
      // -----------------------------------------

      const bookedCount = await this.appointmentRepository.count({
        where: {
          customAvailability: {
            id: availability.id,
          },
          appointmentDate: dto.appointmentDate,
          status: 'BOOKED',
        },
      });

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException('Token capacity is full.');
      }

      // -----------------------------------------
      // Find last token
      // -----------------------------------------

      const lastAppointment = await this.appointmentRepository.findOne({
        where: {
          customAvailability: {
            id: availability.id,
          },
          appointmentDate: dto.appointmentDate,
        },
        order: {
          tokenNumber: 'DESC',
        },
      });

      const nextToken = (lastAppointment?.tokenNumber ?? 0) + 1;

      // -----------------------------------------
      // Release OLD appointment
      // -----------------------------------------

      await this.releaseOldBooking(appointment);

      // -----------------------------------------
      // Increase NEW availability count
      // -----------------------------------------

      availability.bookedPatients += 1;

      await this.customRepository.save(availability);

      // -----------------------------------------
      // Update appointment
      // -----------------------------------------

      appointment.customAvailability = availability;

      appointment.appointmentDate = dto.appointmentDate;

      appointment.schedulingType = 'STREAM';

      appointment.tokenNumber = nextToken;

      appointment.status = 'BOOKED';

      const updated = await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment rescheduled successfully.',

        data: {
          appointmentDate: updated.appointmentDate,

          timeWindow: `${availability.startTime} - ${availability.endTime}`,

          schedulingType: updated.schedulingType,

          tokenNumber: updated.tokenNumber,

          status: updated.status,
        },
      };
    }

    // STREAM = TOKEN BASED
    // RECURRING AVAILABILITY

    if (dto.recurringAvailabilityId) {
      const availability = await this.recurringRepository.findOne({
        where: {
          id: dto.recurringAvailabilityId,
        },
        relations: {
          doctor: true,
        },
      });

      if (!availability) {
        throw new NotFoundException('New availability not found.');
      }

      // Same doctor
      if (availability.doctor.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New availability does not belong to this doctor.',
        );
      }

      // STREAM = token based
      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'Selected availability is not token-based scheduling.',
        );
      }

      // Validate recurring day
      this.validateRecurringDay(dto.appointmentDate, availability.dayOfWeek);

      // Prevent rescheduling to the same recurring availability on the same date
      if (
        appointment.recurringAvailability?.id === availability.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked in this time window.',
        );
      }
      // Capacity validation
      if (!availability.maxCapacity || availability.maxCapacity <= 0) {
        throw new BadRequestException('Invalid availability capacity.');
      }

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
        throw new BadRequestException('Token capacity is full for this date.');
      }

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

      const nextToken = (lastAppointment?.tokenNumber ?? 0) + 1;

      await this.releaseOldBooking(appointment);

      // Update appointment
      appointment.recurringAvailability = availability;

      appointment.appointmentDate = dto.appointmentDate;

      appointment.schedulingType = 'STREAM';

      appointment.tokenNumber = nextToken;

      appointment.status = 'BOOKED';

      const updated = await this.appointmentRepository.save(appointment);

      return {
        message: 'Appointment rescheduled successfully.',

        data: {
          appointmentDate: updated.appointmentDate,

          timeWindow: `${availability.startTime} - ${availability.endTime}`,

          schedulingType: updated.schedulingType,

          tokenNumber: updated.tokenNumber,

          status: updated.status,
        },
      };
    }

    throw new BadRequestException('Invalid rescheduling request.');
  }

  //Cancel the appointment
  async cancelAppointment(user: any, appointmentId: string) {
    const patient = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    const appointment = await this.appointmentRepository.findOne({
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
      throw new NotFoundException('Appointment not found.');
    }

    if (appointment.patient.id !== patient.id) {
      throw new ForbiddenException(
        'You are not authorized to cancel this appointment.',
      );
    }

    if (appointment.status === 'CANCELLED') {
      throw new BadRequestException('Appointment is already cancelled.');
    }

    const appointmentDate = new Date(appointment.appointmentDate);

    if (isNaN(appointmentDate.getTime())) {
      throw new BadRequestException('Invalid appointment date.');
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);

    if (appointmentDate < today) {
      throw new BadRequestException('Past appointments cannot be cancelled.');
    }

    if (appointment.schedulingType === 'WAVE') {
      if (appointment.customSlot) {
        appointment.customSlot.isBooked = false;

        await this.customSlotRepository.save(appointment.customSlot);
      }
    }

    if (appointment.schedulingType === 'STREAM') {
      if (appointment.customAvailability) {
        if (appointment.customAvailability.bookedPatients > 0) {
          appointment.customAvailability.bookedPatients--;
        }

        await this.customRepository.save(appointment.customAvailability);
      }
    }

    appointment.status = 'CANCELLED';

    const cancelled = await this.appointmentRepository.save(appointment);

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
      throw new NotFoundException('Doctor not found.');
    }

    const appointments = await this.appointmentRepository.find({
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
      message: 'Doctor appointments fetched successfully.',

      data: appointments.map((appointment) => {
        let startTime: string | null = null;
        let endTime: string | null = null;

        let timeWindow: string | null = null;

        // WAVE  - exact appointment slot

        if (appointment.schedulingType === 'WAVE') {
          if (appointment.customSlot) {
            startTime = appointment.customSlot.startTime;

            endTime = appointment.customSlot.endTime;
          }

          if (appointment.recurringSlot) {
            startTime = appointment.recurringSlot.startTime;

            endTime = appointment.recurringSlot.endTime;
          }
        }

        // STREAM - Big time window + token

        if (appointment.schedulingType === 'STREAM') {
          if (appointment.customAvailability) {
            startTime = appointment.customAvailability.startTime;

            endTime = appointment.customAvailability.endTime;
          }

          if (appointment.recurringAvailability) {
            startTime = appointment.recurringAvailability.startTime;

            endTime = appointment.recurringAvailability.endTime;
          }

          timeWindow = `${startTime} - ${endTime}`;
        }

        // RESPONSE

        return {
          appointmentId: appointment.id,

          patient: {
            fullName: appointment.patient.fullName,
            email: appointment.patient.email,
            mobileNumber: appointment.patient.mobileNumber,
          },

          appointmentDate: appointment.appointmentDate,

          schedulingType: appointment.schedulingType,

          // STREAM gets time window
          timeWindow,

          // WAVE gets exact slot
          startTime: appointment.schedulingType === 'WAVE' ? startTime : null,

          endTime: appointment.schedulingType === 'WAVE' ? endTime : null,

          // STREAM gets token
          tokenNumber:
            appointment.schedulingType === 'STREAM'
              ? appointment.tokenNumber
              : null,

          status: appointment.status,
        };
      }),
    };
  }
}
