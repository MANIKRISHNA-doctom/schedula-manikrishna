import { Injectable, BadRequestException , NotFoundException} from '@nestjs/common';

import { User } from 'src/auth/user.entity';
import { DoctorProfile } from './doctor.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDoctorProfileDto } from './dto/create-doctor-profile.dto';
import { UpdateDoctorProfileDto } from './dto/update-doctor-profile.dto';

@Injectable()
export class DoctorService {
    constructor(
  @InjectRepository(User)
  private readonly userRepository: Repository<User>,

  @InjectRepository(DoctorProfile)
  private readonly doctorProfileRepository: Repository<DoctorProfile>,
) {}

//CreateDoctorProfile

async createProfile(
  user: any,
  dto: CreateDoctorProfileDto,
) {

  const loggedInUser = await this.userRepository.findOne({
    where: { id: user.sub },
  });

  if (!loggedInUser) {
    throw new NotFoundException('User not found.');
  }


  const existingProfile =
    await this.doctorProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });


  if (existingProfile) {
    throw new BadRequestException(
      'Doctor profile already exists.',
    );
  }


  const profile =
    this.doctorProfileRepository.create({
      user: loggedInUser,
      ...dto,
    });

    const savedProfile = await this.doctorProfileRepository.save(profile);

return {
  message: 'Doctor profile created successfully.',
  data: {
    id: savedProfile.id,
    specialization: savedProfile.specialization,
    experience: savedProfile.experience,
    qualification: savedProfile.qualification,
    profileDetails: savedProfile.profileDetails,
  },
};

}

//getDoctorProfile
async getProfile(user: any) {

  const profile =
    await this.doctorProfileRepository.findOne({
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
      'Doctor profile not found.',
    );
  }


  return {
  message: 'Doctor profile fetched successfully.',
  data: {
    id: profile.id,
    fullName: profile.user.fullName,
    email: profile.user.email,
    mobileNumber: profile.user.mobileNumber,
    specialization: profile.specialization,
    experience: profile.experience,
    qualification: profile.qualification,
    profileDetails: profile.profileDetails,
  },
};
}

//UpdateDoctorProfile
async updateProfile(
  user: any,
  dto: UpdateDoctorProfileDto,
) {

  const profile =
    await this.doctorProfileRepository.findOne({
      where: {
        user: {
          id: user.sub,
        },
      },
    });


  if (!profile) {
    throw new NotFoundException(
      'Doctor profile not found.',
    );
  }


  Object.assign(profile, dto);


  const updatedProfile =
  await this.doctorProfileRepository.save(profile);

return {
  message: 'Doctor profile updated successfully.',
  data: {
    id: updatedProfile.id,
    specialization: updatedProfile.specialization,
    experience: updatedProfile.experience,
    qualification: updatedProfile.qualification,
    profileDetails: updatedProfile.profileDetails,
  },
};
}



}
