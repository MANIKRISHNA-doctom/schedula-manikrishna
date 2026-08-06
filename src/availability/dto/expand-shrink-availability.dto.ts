import {
  IsOptional,
  Matches,
} from 'class-validator';

export class ExpandShrinkAvailabilityDto {
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  startTime?: string;

  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):([0-5]\d)$/)
  endTime?: string;
}