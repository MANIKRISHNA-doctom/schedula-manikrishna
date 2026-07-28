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
import { CreateAppointmentDto } from 'src/appointment/dto/create-appointment.dto';

import { CustomSlot } from 'src/availability/custom-slot.entity';
import { RecurringSlot } from 'src/availability/recurring-slot.entity';
import { RecurringAvailability } from 'src/availability/recurring-availability.entity';
import { CustomAvailability } from 'src/availability/custom-availability.entity';
import { Appointment } from 'src/appointment/appointment.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectRepository(Appointment)
    private appointmentRepository: Repository<Appointment>,

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

  //GetDoctorAvailability
  async getDoctorAvailability(doctorId: string, date: string) {
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
          const bookedPatients = availability.bookedPatients ?? 0;

          const maxCapacity = availability.maxCapacity ?? 0;

          result.push({
            type: 'STREAM',
            date,

            availabilityId: availability.id,

            timeWindow: `${availability.startTime} - ${availability.endTime}`,

            capacity: maxCapacity,

            booked: bookedPatients,

            available: Math.max(maxCapacity - bookedPatients, 0),

            isFull: bookedPatients >= maxCapacity,
          });
        }

        // WAVE = EXACT TIME SLOTS
        else if (availability.schedulingType === 'WAVE') {
          const slots = await this.customSlotRepository.find({
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
        message: 'Doctor availability fetched successfully.',
        data: result,
      };
    }

    // RECURRING AVAILABILITY

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
      // STREAM = BIG WINDOW + TOKEN
      if (availability.schedulingType === 'STREAM') {
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

          availabilityId: availability.id,

          timeWindow: `${availability.startTime} - ${availability.endTime}`,

          capacity: maxCapacity,

          booked: bookedCount,

          available: Math.max(maxCapacity - bookedCount, 0),

          isFull: bookedCount >= maxCapacity,
        });
      }

      // WAVE = EXACT TIME SLOTS
      else if (availability.schedulingType === 'WAVE') {
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

        const availableSlots: any[] = [];

        for (const slot of slots) {
          const booked = await this.appointmentRepository.findOne({
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
      message: 'Doctor availability fetched successfully.',
      data: result,
    };
  }

  //Book appointment
  
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
