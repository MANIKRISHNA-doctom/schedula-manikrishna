import {
 IsUUID,
 IsOptional,
 IsDateString
} from 'class-validator';


export class CreateAppointmentDto {


 @IsUUID()
 doctorId:string;

 //Appointment date
  @IsDateString()
appointmentDate: string;

 // STREAM

 @IsOptional()
 @IsUUID()
 customSlotId?:string;


 @IsOptional()
 @IsUUID()
 recurringSlotId?:string;



 // WAVE

 @IsOptional()
 @IsUUID()
 customAvailabilityId?:string;


 @IsOptional()
 @IsUUID()
 recurringAvailabilityId?:string;


}