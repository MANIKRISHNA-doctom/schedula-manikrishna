import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Req,
  Body,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { AppointmentService } from './appointment.service';

import { CreateAppointmentDto } from './dto/create-appointment.dto';
import { RescheduleAppointmentDto } from './dto/reschedule-appointment.dto';

@Controller('appointment')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
  ) {}

 @Post('booking')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('PATIENT')
  bookAppointment(@Req() req, @Body() dto: CreateAppointmentDto) {
    return this.appointmentService.bookAppointment(req.user, dto);
  }

@Get('my')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('PATIENT')
getMyAppointments(@Req() req) {
  return this.appointmentService.getMyAppointments(req.user);
}

@Patch(':id/cancel')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('PATIENT')
async cancelAppointment(
  @Req() req,
  @Param('id') appointmentId: string,
) {
  return this.appointmentService.cancelAppointment(
    req.user,
    appointmentId,
  );
}

@Patch('patient/:id/reschedule')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('PATIENT')
async rescheduleAppointment(
  @Req() req,
  @Param('id') appointmentId: string,
  @Body() dto: RescheduleAppointmentDto,
) {
  return this.appointmentService.rescheduleAppointment(
    req.user,
    appointmentId,
    dto,
  );
}


@Get('doctor')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('DOCTOR')
async getDoctorAppointments(@Req() req) {
  return this.appointmentService.getDoctorAppointments(
    req.user,
  );
}
}
