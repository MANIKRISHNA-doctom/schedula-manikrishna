import {
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class RescheduleAppointmentDto {
  @IsDateString()
  appointmentDate: string;

  // WAVE - exact slot
  @IsOptional()
  @IsUUID()
  customSlotId?: string;

  @IsOptional()
  @IsUUID()
  recurringSlotId?: string;

  // STREAM - token based
  @IsOptional()
  @IsUUID()
  customAvailabilityId?: string;

  @IsOptional()
  @IsUUID()
  recurringAvailabilityId?: string;
}