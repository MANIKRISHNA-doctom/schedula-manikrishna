import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
} from 'class-validator';

export class CreateCustomAvailabilityDto {

  @IsDateString()
  date: string;

  @IsString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsNotEmpty()
  endTime: string;

  @IsInt()
  @Min(1)
  capacity: number;

  @IsInt()
  @Min(5)
  duration: number;
}