import {
  IsInt,
  IsString,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class CreatePatientProfileDto {
  @IsInt()
  @Min(0)
  @Max(150)
  age: number;

  @IsString()
  gender: string;

  @IsString()
  contactDetails: string;

  @IsOptional()
  @IsString()
  basicHealthInformation?: string;

  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile number must be a valid 10-digit Indian mobile number',
  })
  mobileNumber: string;
}