import { IsEmail, IsNotEmpty, IsOptional, IsString, IsNumber } from 'class-validator';

export class SignupDto {

  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsNotEmpty()
  mobileNumber: string;

  @IsNotEmpty()
  password: string;

  @IsNotEmpty()
  role: string;


  // Only doctor fields
  @IsOptional()
  @IsString()
  specialization?: string;

  @IsOptional()
  @IsNumber()
  experience?: number;
}