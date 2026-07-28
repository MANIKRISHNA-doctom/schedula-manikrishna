import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { User } from 'src/auth/user.entity';
import { PatientProfile } from './patient.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
import { CreateAppointmentDto } from 'src/appointment_booking/dto/create-appointment.dto';

import { CustomSlot } from 'src/availability/custom-slot.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';
import { Appointment } from 'src/appointment_booking/appointment.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Appointment)
private appointmentRepository:
Repository<Appointment>,

    @InjectRepository(PatientProfile)
    private patientProfileRepository: Repository<PatientProfile>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    @InjectRepository(CustomAvailability)
    private customRepository: Repository<CustomAvailability>,

    @InjectRepository(RecurringAvailability)
    private recurringRepository: Repository<RecurringAvailability>,

    @InjectRepository(CustomSlot)
    private customSlotRepository: Repository<CustomSlot>,

    @InjectRepository(RecurringSlot)
    private recurringSlotRepository: Repository<RecurringSlot>,
  ) {}


  //Validate past date
  private validateAppointmentDate(date: string) {

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const bookingDate = new Date(date);
  bookingDate.setHours(0, 0, 0, 0);

  if (bookingDate < today) {
    throw new BadRequestException(
      'Cannot book appointment for a past date.',
    );
  }
}
 //Validate recurring day
  private validateRecurringDay(
  appointmentDate: string,
  dayOfWeek: string,
) {

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

  const existing =
    await this.appointmentRepository.findOne({
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

  //GetDoctorAvailability
async getDoctorAvailability(
  doctorId: string,
  date: string,
) {
  // Check doctor
  const doctor = await this.userRepository.findOne({
    where: {
      id: doctorId,
      role: 'DOCTOR',
    },
  });

  if (!doctor) {
    throw new NotFoundException('Doctor not found.');
  }

  // Validate date
  const parsedDate = new Date(date);

  if (isNaN(parsedDate.getTime())) {
    throw new BadRequestException('Invalid date format.');
  }

  // Normalize date
  parsedDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsedDate < today) {
    throw new BadRequestException(
      'Cannot fetch availability for past dates.',
    );
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

        const bookedPatients =
          availability.bookedPatients ?? 0;

        const maxCapacity =
          availability.maxCapacity ?? 0;

        result.push({
          type: 'STREAM',
          date,

          availabilityId: availability.id,

          timeWindow:
            `${availability.startTime} - ${availability.endTime}`,

          capacity: maxCapacity,

          booked: bookedPatients,

          available:
            Math.max(
              maxCapacity - bookedPatients,
              0,
            ),

          isFull:
            bookedPatients >= maxCapacity,
        });

      }

      // WAVE = EXACT TIME SLOTS
      else if (
        availability.schedulingType === 'WAVE'
      ) {

        const slots =
          await this.customSlotRepository.find({
            where: {
              availability: {
                id: availability.id,
              },
              isBooked: false,
            },
            order: {
              startTime: 'ASC',
            },
          });

        result.push({
          type: 'WAVE',

          date,

          availabilityId: availability.id,

          slots: slots.map((slot) => ({
            slotId: slot.id,
            startTime: slot.startTime,
            endTime: slot.endTime,
          })),
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

    // STREAM = BIG WINDOW + TOKEN
    if (availability.schedulingType === 'STREAM') {

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

        availabilityId: availability.id,

        timeWindow:
          `${availability.startTime} - ${availability.endTime}`,

        capacity: maxCapacity,

        booked: bookedCount,

        available:
          Math.max(
            maxCapacity - bookedCount,
            0,
          ),

        isFull:
          bookedCount >= maxCapacity,
      });

    }

    // WAVE = EXACT TIME SLOTS
    else if (
      availability.schedulingType === 'WAVE'
    ) {

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

      const availableSlots: any[] = [];

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
        type: 'WAVE',

        date,

        availabilityId: availability.id,

        slots: availableSlots,
      });
    }
  }

  return {
    message:
      'Doctor availability fetched successfully.',
    data: result,
  };
}

  //Book appointment
async bookAppointment(
  user: any,
  dto: CreateAppointmentDto,
) {
  // PATIENT

  const patient =
    await this.userRepository.findOne({
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


  // DOCTOR

  const doctor =
    await this.userRepository.findOne({
      where: {
        id: dto.doctorId,
        role: 'DOCTOR',
      },
    });

  if (!doctor) {
    throw new NotFoundException(
      'Doctor not found.',
    );
  }

  // VALIDATE DATE

  this.validateAppointmentDate(
    dto.appointmentDate,
  );

  // ONLY ONE BOOKING TYPE

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

  // DUPLICATE PATIENT BOOKING

  await this.checkDuplicateBooking(
    patient.id,
    doctor.id,
    dto.appointmentDate,
  );

  // STREAM BOOKING

  // CUSTOM STREAM
  if (dto.customAvailabilityId) {

    const availability =
      await this.customRepository.findOne({
        where: {
          id: dto.customAvailabilityId,
        },
      });

    if (!availability) {
      throw new NotFoundException(
        'Availability not found.',
      );
    }

    if (
      availability.schedulingType !== 'STREAM'
    ) {
      throw new BadRequestException(
        'This availability is not STREAM scheduling.',
      );
    }

    if (
      availability.date !==
      dto.appointmentDate
    ) {
      throw new BadRequestException(
        'Appointment date does not match availability date.',
      );
    }

    // Validate capacity configuration
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

    // Check capacity
    if (
      bookedCount >=
      availability.maxCapacity
    ) {
      throw new BadRequestException(
        'STREAM capacity is full.',
      );
    }

    // Token
    const tokenNumber =
      bookedCount + 1;

    availability.bookedPatients =
      tokenNumber;

    await this.customRepository.save(
      availability,
    );

    const appointment =
      this.appointmentRepository.create({
        patient,
        doctor,

        customAvailability:
          availability,

        appointmentDate:
          dto.appointmentDate,

        schedulingType: 'STREAM',

        tokenNumber,

        status: 'BOOKED',
      });

    const savedAppointment =
      await this.appointmentRepository.save(
        appointment,
      );

    return {
      message:
        'STREAM appointment booked successfully.',

      data: {
        appointmentId:
          savedAppointment.id,

        doctorId: doctor.id,

        patientId: patient.id,

        appointmentDate:
          savedAppointment.appointmentDate,

        schedulingType:
          savedAppointment.schedulingType,

        timeWindow:
          `${availability.startTime} - ${availability.endTime}`,

        tokenNumber:
          savedAppointment.tokenNumber,

        status:
          savedAppointment.status,
      },
    };
  }

  // RECURRING STREAM
  if (dto.recurringAvailabilityId) {

    const availability =
      await this.recurringRepository.findOne({
        where: {
          id: dto.recurringAvailabilityId,
        },
      });

    if (!availability) {
      throw new NotFoundException(
        'Availability not found.',
      );
    }

    if (
      availability.schedulingType !== 'STREAM'
    ) {
      throw new BadRequestException(
        'This availability is not STREAM scheduling.',
      );
    }

    // Check correct recurring day
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

    // Count only bookings for this date. Do not use availability.bookedPatients
    const bookedCount =
      await this.appointmentRepository.count({
        where: {
          recurringAvailability: {
            id: availability.id,
          },

          appointmentDate:
            dto.appointmentDate,

          status: 'BOOKED',
        },
      });

    if (
      bookedCount >=
      availability.maxCapacity
    ) {
      throw new BadRequestException(
        'STREAM capacity is full for this date.',
      );
    }

    const tokenNumber =
      bookedCount + 1;

    const appointment =
      this.appointmentRepository.create({
        patient,
        doctor,

        recurringAvailability:
          availability,

        appointmentDate:
          dto.appointmentDate,

        schedulingType: 'STREAM',

        tokenNumber,

        status: 'BOOKED',
      });

    const savedAppointment =
      await this.appointmentRepository.save(
        appointment,
      );

    return {
      message:
        'STREAM appointment booked successfully.',

      data: {
        appointmentId:
          savedAppointment.id,

        doctorId: doctor.id,

        patientId: patient.id,

        appointmentDate:
          savedAppointment.appointmentDate,

        schedulingType:
          savedAppointment.schedulingType,

        timeWindow:
          `${availability.startTime} - ${availability.endTime}`,

        tokenNumber:
          savedAppointment.tokenNumber,

        status:
          savedAppointment.status,
      },
    };
  }

  // WAVE BOOKING

  // CUSTOM WAVE SLOT
  if (dto.customSlotId) {

    const slot =
      await this.customSlotRepository.findOne({
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

    const availability =
      slot.availability;

    if (
      availability.schedulingType !==
      'WAVE'
    ) {
      throw new BadRequestException(
        'This slot is not WAVE scheduling.',
      );
    }

    if (
      availability.date !==
      dto.appointmentDate
    ) {
      throw new BadRequestException(
        'Appointment date does not match slot date.',
      );
    }

    // Exact slot already booked
    if (slot.isBooked) {
      throw new BadRequestException(
        'This time slot is already booked.',
      );
    }

    slot.isBooked = true;

    await this.customSlotRepository.save(
      slot,
    );

    const appointment =
      this.appointmentRepository.create({
        patient,
        doctor,

        customSlot: slot,

        appointmentDate:
          dto.appointmentDate,

        schedulingType: 'WAVE',

        // No token for exact slot booking
        tokenNumber: undefined,

        status: 'BOOKED',
      });

    const savedAppointment =
      await this.appointmentRepository.save(
        appointment,
      );

    return {
      message:
        'WAVE appointment booked successfully.',

      data: {
        appointmentId:
          savedAppointment.id,

        doctorId: doctor.id,

        patientId: patient.id,

        appointmentDate:
          savedAppointment.appointmentDate,

        schedulingType:
          savedAppointment.schedulingType,

        startTime:
          slot.startTime,

        endTime:
          slot.endTime,

        tokenNumber: null,

        status:
          savedAppointment.status,
      },
    };
  }

  // RECURRING WAVE SLOT
  if (dto.recurringSlotId) {

    const slot =
      await this.recurringSlotRepository.findOne({
        where: {
          id: dto.recurringSlotId,
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

    const availability =
      slot.availability;

    if (
      availability.schedulingType !==
      'WAVE'
    ) {
      throw new BadRequestException(
        'This slot is not WAVE scheduling.',
      );
    }

    // Validate recurring date
    this.validateRecurringDay(
      dto.appointmentDate,
      availability.dayOfWeek,
    );

    // A recurring slot can be booked once
    // PER DATE.
    const existingAppointment =
      await this.appointmentRepository.findOne({
        where: {
          recurringSlot: {
            id: slot.id,
          },

          appointmentDate:
            dto.appointmentDate,

          status: 'BOOKED',
        },
      });

    if (existingAppointment) {
      throw new BadRequestException(
        'This time slot is already booked for this date.',
      );
    }

    const appointment =
      this.appointmentRepository.create({
        patient,
        doctor,

        recurringSlot: slot,

        appointmentDate:
          dto.appointmentDate,

        schedulingType: 'WAVE',

        tokenNumber: undefined,

        status: 'BOOKED',
      });

    const savedAppointment =
      await this.appointmentRepository.save(
        appointment,
      );

    return {
      message:
        'WAVE appointment booked successfully.',

      data: {
        appointmentId:
          savedAppointment.id,

        doctorId: doctor.id,

        patientId: patient.id,

        appointmentDate:
          savedAppointment.appointmentDate,

        schedulingType:
          savedAppointment.schedulingType,

        startTime:
          slot.startTime,

        endTime:
          slot.endTime,

        tokenNumber: null,

        status:
          savedAppointment.status,
      },
    };
  }

  throw new BadRequestException(
    'Invalid booking request.',
  );
}
  //CreatePatientProfile
  async createProfile(user: any, dto: CreatePatientProfileDto) {
    const loggedInUser = await this.userRepository.findOne({
      where: {
        id: user.sub,
      },
    });

    if (!loggedInUser) {
      throw new NotFoundException('User not found.');
    }

    const existingProfile = await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });

    if (existingProfile) {
      throw new BadRequestException('Patient profile already exists.');
    }

    const profile = this.patientProfileRepository.create({
      user: loggedInUser,
      ...dto,
    });

    const savedProfile = await this.patientProfileRepository.save(profile);

    return {
      message: 'Patient profile created successfully.',
      data: {
        id: savedProfile.id,
        age: savedProfile.age,
        gender: savedProfile.gender,
        contactDetails: savedProfile.contactDetails,
        basicHealthInformation: savedProfile.basicHealthInformation,
      },
    };
  }

  //getPatientProfile
  async getProfile(user: any) {
    const profile = await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
      relations: {
        user: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found.');
    }

    return {
      message: 'Patient profile fetched successfully.',
      data: {
        id: profile.id,
        fullName: profile.user.fullName,
        email: profile.user.email,
        mobileNumber: profile.user.mobileNumber,
        age: profile.age,
        gender: profile.gender,
        contactDetails: profile.contactDetails,
        basicHealthInformation: profile.basicHealthInformation,
      },
    };
  }

  //updatePatientProfile
  async updateProfile(user: any, dto: UpdatePatientProfileDto) {
    const profile = await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });

    if (!profile) {
      throw new NotFoundException('Patient profile not found.');
    }

    Object.assign(profile, dto);

    const updatedProfile = await this.patientProfileRepository.save(profile);

    return {
      message: 'Patient profile updated successfully.',
      data: {
        id: updatedProfile.id,
        age: updatedProfile.age,
        gender: updatedProfile.gender,
        contactDetails: updatedProfile.contactDetails,
        basicHealthInformation: updatedProfile.basicHealthInformation,
      },
    };
  }
}
