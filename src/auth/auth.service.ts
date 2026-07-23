import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

import { User } from './user.entity';

import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';


@Injectable()
export class AuthService {

constructor(

@InjectRepository(User)
private userRepository: Repository<User>,

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
  } = dto;

  // Check existing email
  const existingEmail = await this.userRepository.findOne({
    where: { email },
  });

  if (existingEmail) {
    throw new BadRequestException('Email already registered.');
  }

  // Check existing mobile number
  const existingMobile = await this.userRepository.findOne({
    where: { mobileNumber },
  });

  if (existingMobile) {
    throw new BadRequestException('Mobile number already registered.');
  }

  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const user = this.userRepository.create({
    fullName,
    email,
    mobileNumber,
    password: hashedPassword,
    role,
  });

  const savedUser = await this.userRepository.save(user);

  return {
    message: 'Account created successfully.',
    user: {
      id: savedUser.id,
      fullName: savedUser.fullName,
      email: savedUser.email,
      role: savedUser.role,
    },
  };
}



// SIGNIN

async signin(dto: SigninDto) {
  const { email, password } = dto;

  if (!email || !password) {
    throw new BadRequestException(
      'Email and password are required.',
    );
  }

  const user = await this.userRepository.findOne({
    where: { email },
  });

  if (!user) {
    throw new BadRequestException(
      'Invalid email or password.',
    );
  }

  const isPasswordValid = await bcrypt.compare(
    password,
    user.password,
  );

  if (!isPasswordValid) {
    throw new BadRequestException(
      'Invalid email or password.',
    );
  }

  const payload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  const accessToken = await this.jwtService.signAsync(payload);

  return {
    message: 'Login successful.',
    accessToken,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
    },
  };
}
}