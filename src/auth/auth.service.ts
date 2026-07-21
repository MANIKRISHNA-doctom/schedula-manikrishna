import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/users.entity';
import { Doctor } from 'src/doctor/doctor.entity';

import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';


@Injectable()
export class AuthService {

constructor(

@InjectRepository(User)
private userRepository: Repository<User>,


@InjectRepository(Doctor)
private doctorRepository: Repository<Doctor>

){}


// SIGNUP

async signup(dto: SignupDto) {
  const {
    fullName,
    email,
    mobileNumber,
    password,
    role,
    specialization,
    experience,
  } = dto;

  // Validate doctor-specific fields
  if (role === 'DOCTOR') {
    if (!specialization || experience === undefined) {
      throw new BadRequestException(
        'Specialization and experience are required for doctors.',
      );
    }
  }

  // Check email in users table
  const userEmail = await this.userRepository.findOne({
    where: { email },
  });

  // Check email in doctors table
  const doctorEmail = await this.doctorRepository.findOne({
    where: { email },
  });

  if (userEmail || doctorEmail) {
    throw new BadRequestException('Email already registered.');
  }

  // Check mobile in users table
  const userMobile = await this.userRepository.findOne({
    where: { mobileNumber },
  });

  // Check mobile in doctors table
  const doctorMobile = await this.doctorRepository.findOne({
    where: { mobileNumber },
  });

  if (userMobile || doctorMobile) {
    throw new BadRequestException('Mobile number already registered.');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Save doctor
  if (role === 'DOCTOR') {
    const doctor = this.doctorRepository.create({
      fullName,
      email,
      mobileNumber,
      password: hashedPassword,
      specialization,
      experience,
    });

    return await this.doctorRepository.save(doctor);
  }

  // Save patient
  const user = this.userRepository.create({
    fullName,
    email,
    mobileNumber,
    password: hashedPassword,
  });

  return await this.userRepository.save(user);
}



// SIGNIN

async signin(dto:SigninDto){


let account;


account = await this.userRepository.findOne({
where:{
email:dto.email
}
});


if(!account){

account = await this.doctorRepository.findOne({
where:{
email:dto.email
}
});

}


if(!account){

throw new BadRequestException(
'Invalid email or password'
);

}



const isPasswordValid = await bcrypt.compare(
dto.password,
account.password
);


if(!isPasswordValid){

throw new BadRequestException(
'Invalid email or password'
);

}

return {
message:"Login successful",
user:account
};


}

}