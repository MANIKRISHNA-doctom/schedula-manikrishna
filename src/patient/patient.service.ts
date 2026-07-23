import { Injectable, BadRequestException , NotFoundException} from '@nestjs/common';
import { User } from 'src/auth/user.entity';
import { PatientProfile } from './patient.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';
@Injectable()
export class PatientService {
    constructor(
  @InjectRepository(User)
  private readonly userRepository: Repository<User>,

  @InjectRepository(PatientProfile)
  private readonly patientProfileRepository: Repository<PatientProfile>,
) {}

//CreatePatientProfile
async createProfile(
  user: any,
  dto: CreatePatientProfileDto,
) {

  const loggedInUser =
    await this.userRepository.findOne({
      where: {
        id: user.sub,
      },
    });


  if (!loggedInUser) {
    throw new NotFoundException(
      'User not found.',
    );
  }


  const existingProfile =
    await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });


  if (existingProfile) {
    throw new BadRequestException(
      'Patient profile already exists.',
    );
  }


  const profile =
    this.patientProfileRepository.create({
      user: loggedInUser,
      ...dto,
    });


  const savedProfile =
  await this.patientProfileRepository.save(profile);

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

  const profile =
    await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
      relations: {
        user: true,
        }
    });


  if (!profile) {
    throw new NotFoundException(
      'Patient profile not found.',
    );
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
async updateProfile(
  user: any,
  dto: UpdatePatientProfileDto,
) {

  const profile =
    await this.patientProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });


  if (!profile) {
    throw new NotFoundException(
      'Patient profile not found.',
    );
  }


  Object.assign(profile, dto);


  const updatedProfile =
  await this.patientProfileRepository.save(profile);

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
