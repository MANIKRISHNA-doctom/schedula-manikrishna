import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Matches,
} from 'class-validator';

export class CreateCustomAvailabilityDto {

  @IsDateString()
  date: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime: string;

  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime: string;

  @IsEnum(['STREAM', 'WAVE'])
  schedulingType: string;

  // WAVE
  @IsOptional()
  @IsInt()
  @Min(1)
  duration?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  bufferTime?: number;

  // STREAM
  @IsOptional()
  @IsInt()
  @Min(1)
  maxCapacity?: number;
}