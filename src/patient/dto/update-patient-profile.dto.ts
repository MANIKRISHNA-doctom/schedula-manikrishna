import {
  IsInt,
  IsString,
  IsOptional,
  Min,
  Max,
  Matches,
} from 'class-validator';

export class UpdatePatientProfileDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(150)
  age?: number;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  contactDetails?: string;

  @IsOptional()
  @IsString()
  basicHealthInformation?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile number must be a valid 10-digit Indian mobile number',
  })
  mobileNumber?: string;
}