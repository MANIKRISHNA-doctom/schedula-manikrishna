import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

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
private doctorRepository: Repository<Doctor> ,

private readonly jwtService: JwtService,

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

    const savedDoctor = await this.doctorRepository.save(doctor);

    return {
        message: 'Account created successfully.',
        user: {
            id: savedDoctor.id,
            fullName: savedDoctor.fullName,
            email: savedDoctor.email,
        },
     };
  }

  // Save patient
  const user = this.userRepository.create({
    fullName,
    email,
    mobileNumber,
    password: hashedPassword,
  });

  const savedUser = await this.userRepository.save(user);
  return {
    message: 'Account created successfully.',
    user: {
        id: savedUser.id,
        fullName: savedUser.fullName,
        email: savedUser.email,
    },
  };
}



// SIGNIN

async signin(dto: SigninDto) {

  const { email, password } = dto;

  if (!email || !password) {
    throw new BadRequestException('Email and password are required.');
  }

  let account;
  let role = 'PATIENT';

  account = await this.userRepository.findOne({
    where: { email },
  });

  if (!account) {
    account = await this.doctorRepository.findOne({
      where: { email },
    });

    if (account) {
      role = 'DOCTOR';
    }
  }

  if (!account) {
    throw new BadRequestException('Invalid email or password.');
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    account.password,
  );

  if (!isPasswordValid) {
    throw new BadRequestException('Invalid email or password.');
  }

  const payload = {
    sub: account.id,
    email: account.email,
    role,
  };

  const accessToken = await this.jwtService.signAsync(payload);

  return {
    message: 'Login successful.',
    accessToken,
    user: {
      id: account.id,
      fullName: account.fullName,
      email: account.email,
      role,
    },
  };
}

}