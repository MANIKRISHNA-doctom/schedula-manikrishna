import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { DataSource,Repository ,EntityManager} from 'typeorm';
import { MailService } from 'src/email/email.service';
import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

import { Appointment } from './appointment.entity';
import { User } from 'src/auth/user.entity';
import { CustomSlot } from 'src/availability/custom-slot.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';
import { Notification } from 'src/notifications/notifications.entity';

@Injectable()
export class AppointmentService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
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
private async releaseOldBooking(
  appointment: Appointment,
  manager: EntityManager,
) {
  // WAVE = exact slot
  if (appointment.customSlot) {
    appointment.customSlot.isBooked = false;

    await manager.save(appointment.customSlot);
  }

  // STREAM = token based
  if (
    appointment.customAvailability &&
    appointment.schedulingType === 'STREAM'
  ) {
    appointment.customAvailability.bookedPatients--;

    if (
      appointment.customAvailability.bookedPatients < 0
    ) {
      appointment.customAvailability.bookedPatients = 0;
    }

    await manager.save(
      appointment.customAvailability,
    );
  }
}

  // Book appointment
  async bookAppointment(user: any, dto: CreateAppointmentDto) {
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    
    // PATIENT

    const patient = await queryRunner.manager.findOne(User, {
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    // =========================================================
    // DOCTOR
    // =========================================================

    const doctor = await queryRunner.manager.findOne(User, {
      where: {
        id: dto.doctorId,
        role: 'DOCTOR',
      },
    });

    if (!doctor) {
      throw new NotFoundException('Doctor not found.');
    }

    // =========================================================
    // VALIDATE DATE
    // =========================================================

    this.validateAppointmentDate(dto.appointmentDate);

    // =========================================================
    // ONLY ONE BOOKING TYPE
    // =========================================================

    const bookingTypes = [
      dto.customSlotId,
      dto.recurringSlotId,
      dto.customAvailabilityId,
      dto.recurringAvailabilityId,
    ].filter(Boolean);

    if (bookingTypes.length !== 1) {
      throw new BadRequestException(
        'Provide exactly one booking type.',
      );
    }

    // =========================================================
    // DUPLICATE PATIENT BOOKING
    // =========================================================

    await this.checkDuplicateBooking(
      patient.id,
      doctor.id,
      dto.appointmentDate,
    );

    let savedAppointment: Appointment;
    let notificationMessage: string;

    // =========================================================
    // 1. CUSTOM STREAM
    // =========================================================

    if (dto.customAvailabilityId) {
      const availability = await queryRunner.manager.findOne(
        CustomAvailability,
        {
          where: {
            id: dto.customAvailabilityId,
          },
        },
      );

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

      if (
        !availability.maxCapacity ||
        availability.maxCapacity <= 0
      ) {
        throw new BadRequestException(
          'Invalid STREAM capacity.',
        );
      }

      const bookedCount =
        availability.bookedPatients ?? 0;

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException(
          'STREAM capacity is full.',
        );
      }

      const lastAppointment =
        await queryRunner.manager.findOne(Appointment, {
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

      const tokenNumber =
        (lastAppointment?.tokenNumber ?? 0) + 1;

      availability.bookedPatients =
        bookedCount + 1;

      await queryRunner.manager.save(availability);

      const appointment =
        queryRunner.manager.create(Appointment, {
          patient,
          doctor,
          customAvailability: availability,
          appointmentDate: dto.appointmentDate,
          schedulingType: 'STREAM',
          tokenNumber,
          status: 'BOOKED',
        });

      savedAppointment =
        await queryRunner.manager.save(appointment);

      notificationMessage =
        `Your appointment with Dr. ${doctor.fullName} ` +
        `has been booked successfully for ` +
        `${dto.appointmentDate} at ` +
        `${availability.startTime}.`;
    }

    // =========================================================
    // 2. RECURRING STREAM
    // =========================================================

    else if (dto.recurringAvailabilityId) {
      const availability =
        await queryRunner.manager.findOne(
          RecurringAvailability,
          {
            where: {
              id: dto.recurringAvailabilityId,
            },
          },
        );

      if (!availability) {
        throw new NotFoundException(
          'Availability not found.',
        );
      }

      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'This availability is not STREAM scheduling.',
        );
      }

      this.validateRecurringDay(
        dto.appointmentDate,
        availability.dayOfWeek,
      );

      if (
        !availability.maxCapacity ||
        availability.maxCapacity <= 0
      ) {
        throw new BadRequestException(
          'Invalid STREAM capacity.',
        );
      }

      const bookedCount =
        await queryRunner.manager.count(Appointment, {
          where: {
            recurringAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
            status: 'BOOKED',
          },
        });

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException(
          'STREAM capacity is full for this date.',
        );
      }

      const lastAppointment =
        await queryRunner.manager.findOne(Appointment, {
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

      const tokenNumber =
        (lastAppointment?.tokenNumber ?? 0) + 1;

      const appointment =
        queryRunner.manager.create(Appointment, {
          patient,
          doctor,
          recurringAvailability: availability,
          appointmentDate: dto.appointmentDate,
          schedulingType: 'STREAM',
          tokenNumber,
          status: 'BOOKED',
        });

      savedAppointment =
        await queryRunner.manager.save(appointment);

      notificationMessage =
        `Your appointment with Dr. ${doctor.fullName} ` +
        `has been booked successfully for ` +
        `${dto.appointmentDate} at ` +
        `${availability.startTime}.`;
    }

    // 3. CUSTOM WAVE
    else if (dto.customSlotId) {
      const slot =
        await queryRunner.manager.findOne(CustomSlot, {
          where: {
            id: dto.customSlotId,
          },
          relations: {
            availability: true,
          },
        });

      if (!slot) {
        throw new NotFoundException(
          'Slot not found.',
        );
      }

      const availability = slot.availability;

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'This slot is not WAVE scheduling.',
        );
      }

      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match slot date.',
        );
      }

      if (slot.isBooked) {
        throw new BadRequestException(
          'This time slot is already booked.',
        );
      }

      const bookedCount =
        await queryRunner.manager.count(Appointment, {
          where: {
            customAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
            status: 'BOOKED',
          },
        });

      if (
        availability.maxCapacity &&
        bookedCount >= availability.maxCapacity
      ) {
        throw new BadRequestException(
          'Maximum booking capacity reached.',
        );
      }

      slot.isBooked = true;
      availability.bookedPatients =
        (availability.bookedPatients ?? 0) + 1;

      await queryRunner.manager.save(slot);
      await queryRunner.manager.save(availability);

      const appointment =
        queryRunner.manager.create(Appointment, {
          patient,
          doctor,
          customSlot: slot,
          customAvailability: availability,
          appointmentDate: dto.appointmentDate,
          schedulingType: 'WAVE',
          tokenNumber: undefined,
          status: 'BOOKED',
        });

      savedAppointment =
        await queryRunner.manager.save(appointment);

      notificationMessage =
        `Your appointment with Dr. ${doctor.fullName} ` +
        `has been booked successfully for ` +
        `${dto.appointmentDate} from ` +
        `${slot.startTime} to ${slot.endTime}.`;
    }

    // =========================================================
    // 4. RECURRING WAVE
    // =========================================================

    else if (dto.recurringSlotId) {
      const slot =
        await queryRunner.manager.findOne(
          RecurringSlot,
          {
            where: {
              id: dto.recurringSlotId,
            },
            relations: {
              availability: true,
            },
          },
        );

      if (!slot) {
        throw new NotFoundException(
          'Slot not found.',
        );
      }

      const availability = slot.availability;

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'This slot is not WAVE scheduling.',
        );
      }

      this.validateRecurringDay(
        dto.appointmentDate,
        availability.dayOfWeek,
      );

      const existingAppointment =
        await queryRunner.manager.findOne(
          Appointment,
          {
            where: {
              recurringSlot: {
                id: slot.id,
              },
              appointmentDate: dto.appointmentDate,
              status: 'BOOKED',
            },
          },
        );

      if (existingAppointment) {
        throw new BadRequestException(
          'This time slot is already booked for this date.',
        );
      }

      const bookedCount =
        await queryRunner.manager.count(Appointment, {
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

      if (
        availability.maxCapacity &&
        bookedCount >= availability.maxCapacity
      ) {
        throw new BadRequestException(
          'Maximum booking capacity reached.',
        );
      }

      const appointment =
        queryRunner.manager.create(Appointment, {
          patient,
          doctor,
          recurringSlot: slot,
          recurringAvailability: availability,
          appointmentDate: dto.appointmentDate,
          schedulingType: 'WAVE',
          tokenNumber: undefined,
          status: 'BOOKED',
        });

      savedAppointment =
        await queryRunner.manager.save(appointment);

      notificationMessage =
        `Your appointment with Dr. ${doctor.fullName} ` +
        `has been booked successfully for ` +
        `${dto.appointmentDate} from ` +
        `${slot.startTime} to ${slot.endTime}.`;
    }

    else {
      throw new BadRequestException(
        'Invalid booking request.',
      );
    }

    // =========================================================
    // CREATE BOOKING NOTIFICATION
    // =========================================================

    await this.createNotification(
      queryRunner.manager,
      patient.id,
      "APPOINTMENT_BOOKED",
      'Appointment Booked',
      notificationMessage,
      savedAppointment.id
    );

    // =========================================================
    // COMMIT
    // =========================================================

    await queryRunner.commitTransaction();

    const appointmentStartTime =
      savedAppointment.customSlot?.startTime ||
      savedAppointment.recurringSlot?.startTime ||
      savedAppointment.recurringAvailability?.startTime ||
      savedAppointment.customAvailability?.startTime;
    
      const appointmentEndTime = 
       savedAppointment.customSlot?.endTime ||
      savedAppointment.recurringSlot?.endTime ||
      savedAppointment.recurringAvailability?.endTime ||
      savedAppointment.customAvailability?.endTime;

    if (!appointmentStartTime || !appointmentEndTime) {
    throw new Error('Appointment time could not be determined');
  }

    await this.mailService.sendAppointmentBookedMail(
    patient.email,
    patient.fullName,
    doctor.fullName,
    savedAppointment.appointmentDate,
    appointmentStartTime
  );

    return {
      message: 'Appointment booked successfully.',
      data: {
        appointmentId: savedAppointment.id,
        appointmentDate:
          savedAppointment.appointmentDate,
        schedulingType:
          savedAppointment.schedulingType,
        status: savedAppointment.status,
        appointmentStartTime,
        appointmentEndTime
      },
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
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const manager = queryRunner.manager;

    // 1. Find patient
    const patient = await manager.findOne(
      this.userRepository.target,
      {
        where: {
          id: user.sub,
          role: 'PATIENT',
        },
      },
    );

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    // 2. Find existing appointment
    const appointment = await manager.findOne(
      this.appointmentRepository.target,
      {
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
      },
    );

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
      throw new BadRequestException(
        'Provide exactly one new booking type.',
      );
    }

    // 6. Validate new date
    this.validateAppointmentDate(dto.appointmentDate);

    // 7. Existing appointment should not be past
    const oldDate = new Date(appointment.appointmentDate);

    if (isNaN(oldDate.getTime())) {
      throw new BadRequestException(
        'Invalid existing appointment date.',
      );
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    oldDate.setHours(0, 0, 0, 0);

    if (oldDate < today) {
      throw new BadRequestException(
        'Past appointments cannot be rescheduled.',
      );
    }

    /*
     * ==========================================
     * WAVE - CUSTOM EXACT SLOT
     * ==========================================
     */

    if (dto.customSlotId) {
      const newSlot = await manager.findOne(
        this.customSlotRepository.target,
        {
          where: {
            id: dto.customSlotId,
          },
          relations: {
            availability: {
              doctor : true,
            } 
          },
        },
      );

      if (!newSlot) {
        throw new NotFoundException('New slot not found.');
      }

      const availability = newSlot.availability;

      if (availability.doctor.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New slot does not belong to this doctor.',
        );
      }

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'Selected availability is not an exact-slot schedule.',
        );
      }

      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match the selected slot.',
        );
      }

      if (
        appointment.customSlot?.id === newSlot.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked for this slot.',
        );
      }

      if (newSlot.isBooked) {
        throw new BadRequestException(
          'Selected slot is already booked.',
        );
      }

      // Release old booking using transaction manager
      await this.releaseOldBooking(
        appointment,
        manager,
      );

      newSlot.isBooked = true;

      await manager.save(newSlot);

      appointment.customSlot = newSlot;
      appointment.recurringSlot = null;
      appointment.customAvailability = newSlot.availability;
      appointment.recurringAvailability = null;

      appointment.appointmentDate = dto.appointmentDate;
      appointment.schedulingType = 'WAVE';
      appointment.status = 'BOOKED';

      const updated = await manager.save(appointment);

      // Create notification
      const notificationMessage =
        `Your appointment with has been rescheduled to ` +
        `${updated.appointmentDate} from ` +
        `${newSlot.startTime} to ${newSlot.endTime}.`;

      await this.createNotification(
        manager,
        patient.id,
        'APPOINTMENT_RESCHEDULED',
        'Appointment Rescheduled',
        notificationMessage,
        updated.id,
      );

      
    }

    /*
     * ==========================================
     * WAVE - RECURRING EXACT SLOT
     * ==========================================
     */

    if (dto.recurringSlotId) {
      const newSlot = await manager.findOne(
        this.recurringSlotRepository.target,
        {
          where: {
            id: dto.recurringSlotId,
          },
          relations: {
            availability: {
                 doctor :true,
          },
        },
        }
      );

      if (!newSlot) {
        throw new NotFoundException('New slot not found.');
      }

      const availability = newSlot.availability;

      if (availability.doctor.id !== appointment.doctor.id) {
        throw new BadRequestException(
          'New slot does not belong to this doctor.',
        );
      }

      if (availability.schedulingType !== 'WAVE') {
        throw new BadRequestException(
          'Selected availability is not an exact-slot schedule.',
        );
      }

      this.validateRecurringDay(
        dto.appointmentDate,
        availability.dayOfWeek,
      );

      if (
        appointment.recurringSlot?.id === newSlot.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked for this slot.',
        );
      }

      const existingBooking = await manager.findOne(
        this.appointmentRepository.target,
        {
          where: {
            recurringSlot: {
              id: newSlot.id,
            },
            appointmentDate: dto.appointmentDate,
            status: 'BOOKED',
          },
        },
      );

      if (existingBooking) {
        throw new BadRequestException(
          'Selected slot is already booked for this date.',
        );
      }

      await this.releaseOldBooking(
        appointment,
        manager,
      );

      appointment.customSlot = null;
      appointment.recurringSlot = newSlot;
      appointment.customAvailability = null;
      appointment.recurringAvailability = newSlot.availability;

      appointment.appointmentDate = dto.appointmentDate;
      appointment.schedulingType = 'WAVE';
      appointment.status = 'BOOKED';

      const updated = await manager.save(appointment);

      // Create notification
      const notificationMessage =
        `Your appointment has been rescheduled to ` +
        `${updated.appointmentDate} from ` +
        `${newSlot.startTime} to ${newSlot.endTime}.`;

      await this.createNotification(
        manager,
        patient.id,
        'APPOINTMENT_RESCHEDULED',
        'Appointment Rescheduled',
        notificationMessage,
        updated.id,
      );

    }

    /*
     * ==========================================
     * STREAM - CUSTOM AVAILABILITY
     * ==========================================
     */

    if (dto.customAvailabilityId) {
      const availability = await manager.findOne(
        this.customRepository.target,
        {
          where: {
            id: dto.customAvailabilityId,
          },
          relations: {
            doctor: true,
          },
        },
      );

      if (!availability) {
        throw new NotFoundException(
          'New availability not found.',
        );
      }

      if (
        availability.doctor.id !== appointment.doctor.id
      ) {
        throw new BadRequestException(
          'New availability does not belong to this doctor.',
        );
      }

      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'Selected availability is not token-based scheduling.',
        );
      }

      if (availability.date !== dto.appointmentDate) {
        throw new BadRequestException(
          'Appointment date does not match availability.',
        );
      }

      if (
        appointment.customAvailability?.id === availability.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked in this time window.',
        );
      }

      if (
        !availability.maxCapacity ||
        availability.maxCapacity <= 0
      ) {
        throw new BadRequestException(
          'Invalid availability capacity.',
        );
      }

      const bookedCount = await manager.count(
        this.appointmentRepository.target,
        {
          where: {
            customAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
            status: 'BOOKED',
          },
        },
      );

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException(
          'Token capacity is full.',
        );
      }

      const lastAppointment = await manager.findOne(
        this.appointmentRepository.target,
        {
          where: {
            customAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
          },
          order: {
            tokenNumber: 'DESC',
          },
        },
      );

      const nextToken =
        (lastAppointment?.tokenNumber ?? 0) + 1;

      await this.releaseOldBooking(
        appointment,
        manager,
      );

      availability.bookedPatients += 1;

      await manager.save(availability);

      appointment.customAvailability = availability;
      appointment.customSlot = null;
      appointment.recurringAvailability = null;
      appointment.recurringSlot = null;

      appointment.appointmentDate = dto.appointmentDate;
      appointment.schedulingType = 'STREAM';
      appointment.tokenNumber = nextToken;
      appointment.status = 'BOOKED';

      const updated = await manager.save(appointment);

      // Create notification
      const notificationMessage =
        `Your appointment has been rescheduled to ` +
        `${updated.appointmentDate} ` +
        `(${availability.startTime} - ${availability.endTime}).`;

      await this.createNotification(
        manager,
        patient.id,
        'APPOINTMENT_RESCHEDULED',
        'Appointment Rescheduled',
        notificationMessage,
        updated.id,
      );

      
    }

    /*
     * ==========================================
     * STREAM - RECURRING AVAILABILITY
     * ==========================================
     */

    if (dto.recurringAvailabilityId) {
      const availability = await manager.findOne(
        this.recurringRepository.target,
        {
          where: {
            id: dto.recurringAvailabilityId,
          },
          relations: {
            doctor: true,
          },
        },
      );

      if (!availability) {
        throw new NotFoundException(
          'New availability not found.',
        );
      }

      if (
        availability.doctor.id !== appointment.doctor.id
      ) {
        throw new BadRequestException(
          'New availability does not belong to this doctor.',
        );
      }

      if (availability.schedulingType !== 'STREAM') {
        throw new BadRequestException(
          'Selected availability is not token-based scheduling.',
        );
      }

      this.validateRecurringDay(
        dto.appointmentDate,
        availability.dayOfWeek,
      );

      if (
        appointment.recurringAvailability?.id === availability.id &&
        appointment.appointmentDate === dto.appointmentDate
      ) {
        throw new BadRequestException(
          'You are already booked in this time window.',
        );
      }

      if (
        !availability.maxCapacity ||
        availability.maxCapacity <= 0
      ) {
        throw new BadRequestException(
          'Invalid availability capacity.',
        );
      }

      const bookedCount = await manager.count(
        this.appointmentRepository.target,
        {
          where: {
            recurringAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
            status: 'BOOKED',
          },
        },
      );

      if (bookedCount >= availability.maxCapacity) {
        throw new BadRequestException(
          'Token capacity is full for this date.',
        );
      }

      const lastAppointment = await manager.findOne(
        this.appointmentRepository.target,
        {
          where: {
            recurringAvailability: {
              id: availability.id,
            },
            appointmentDate: dto.appointmentDate,
          },
          order: {
            tokenNumber: 'DESC',
          },
        },
      );

      const nextToken =
        (lastAppointment?.tokenNumber ?? 0) + 1;

      await this.releaseOldBooking(
        appointment,
        manager,
      );

      appointment.customAvailability = null;
      appointment.customSlot = null;
      appointment.recurringAvailability = availability;
      appointment.recurringSlot = null;

      appointment.appointmentDate = dto.appointmentDate;
      appointment.schedulingType = 'STREAM';
      appointment.tokenNumber = nextToken;
      appointment.status = 'BOOKED';

      const updated = await manager.save(appointment);

      // Create notification
      const notificationMessage =
        `Your appointment has been rescheduled to ` +
        `${updated.appointmentDate} ` +
        `(${availability.startTime} - ${availability.endTime}).`;

      await this.createNotification(
        manager,
        patient.id,
        'APPOINTMENT_RESCHEDULED',
        'Appointment Rescheduled',
        notificationMessage,
        updated.id,
      );
    }

    await queryRunner.commitTransaction();

        const appointmentStartTime =
  appointment.customSlot?.startTime ||
  appointment.recurringSlot?.startTime ||
  appointment.recurringAvailability?.startTime ||
  appointment.customAvailability?.startTime;

   const appointmentEndTime =
  appointment.customSlot?.endTime ||
  appointment.recurringSlot?.endTime ||
  appointment.recurringAvailability?.endTime ||
  appointment.customAvailability?.endTime;

if (!appointmentStartTime || !appointmentEndTime) {
  throw new Error('Appointment time could not be determined');
}

      await this.mailService.sendAppointmentRescheduledMail(  
  patient.email,
  patient.fullName,
  appointment.doctor.fullName,
  appointment.appointmentDate,
  appointmentStartTime,
);

      return {
        message: 'Appointment rescheduled successfully.',
        data: {
          appointmentDate: appointment.appointmentDate,
          startTime: appointmentStartTime,
          endTime: appointmentEndTime,
          schedulingType: appointment.schedulingType,
          status: appointment.status,
        },
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

  //Cancel the appointment
  async cancelAppointment(user: any, appointmentId: string) {
  const queryRunner = this.dataSource.createQueryRunner();

  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    const patient = await queryRunner.manager.findOne(User, {
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    const appointment = await queryRunner.manager.findOne(
      this.appointmentRepository.target,
      {
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
      },
    );

    if (!appointment) {
      throw new NotFoundException('Appointment not found.');
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

    const appointmentDate = new Date(appointment.appointmentDate);

    if (isNaN(appointmentDate.getTime())) {
      throw new BadRequestException('Invalid appointment date.');
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    appointmentDate.setHours(0, 0, 0, 0);

    if (appointmentDate < today) {
      throw new BadRequestException(
        'Past appointments cannot be cancelled.',
      );
    }

    // Release WAVE slot
    if (appointment.schedulingType === 'WAVE') {
      if (appointment.customSlot) {
        appointment.customSlot.isBooked = false;

        await queryRunner.manager.save(
          appointment.customSlot,
        );
      }
    }

    // Update STREAM availability
    if (appointment.schedulingType === 'STREAM') {
      if (appointment.customAvailability) {
        if (appointment.customAvailability.bookedPatients > 0) {
          appointment.customAvailability.bookedPatients--;
        }

        await queryRunner.manager.save(
          appointment.customAvailability,
        );
      }
    }
    // Cancel appointment
    appointment.status = 'CANCELLED';

    const cancelled = await queryRunner.manager.save(
      appointment,
    );

    // Create cancellation notification
    const notificationMessage =
  `Your appointment with Dr. ${cancelled.doctor.fullName} scheduled on ` +
  `${cancelled.appointmentDate} at ${cancelled.recurringSlot?.startTime || cancelled.customSlot?.startTime} ` +
  `has been cancelled.`;

    await this.createNotification(
      queryRunner.manager,
      patient.id,
      'APPOINTMENT_CANCELLED',
      'Appointment Cancelled',
      notificationMessage,
      cancelled.id,
    );

    const appointmentTime =
  cancelled.customSlot?.startTime ||
  cancelled.recurringSlot?.startTime ||
  cancelled.recurringAvailability?.startTime ||
  cancelled.customAvailability?.startTime;

  if (!appointmentTime) {
  throw new Error('Appointment time could not be determined');
}
    // Commit
    await queryRunner.commitTransaction();
    
    await this.mailService.sendAppointmentCancelledMail(
      patient.email,
      patient.fullName,
      appointment.doctor.fullName,
      cancelled.appointmentDate,
      appointmentTime,
    );

    return {
      message: 'Appointment cancelled successfully.',
      data: {
        appointmentId: cancelled.id,
        appointmentDate: cancelled.appointmentDate,
        schedulingType: cancelled.schedulingType,
        status: cancelled.status,
        appointmentStartTime : appointmentTime,
      },
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

  //get patient notifications
  async getPatientNotifications(user: any) {
  const patient = await this.userRepository.findOne({
    where: {
      id: user.sub,
      role: 'PATIENT',
    },
  });

  if (!patient) {
    throw new NotFoundException('Patient not found.');
  }

  const notifications = await this.notificationRepository.find({
    where: {
      patient: {
        id: patient.id,
      },
    },
    relations: {
      appointment: true,
    },
    order: {
      createdAt: 'DESC',
    },
  });

  return {
    message: 'Notifications fetched successfully.',
    data: notifications.map((notification) => ({
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message
    })),
  };
}
}
