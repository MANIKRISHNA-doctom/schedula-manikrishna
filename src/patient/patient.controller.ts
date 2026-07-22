import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PatientService } from './patient.service';
import { CreatePatientProfileDto } from './dto/create-patient-profile.dto';
import { UpdatePatientProfileDto } from './dto/update-patient-profile.dto';

@Controller('patient')
export class PatientController {
  constructor(
    private readonly patientService: PatientService,
  ) {}

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('PATIENT')
  getProfile(@Req() req) {
    return this.patientService.getProfile(req.user);
  }

  @Post('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('PATIENT')
  createProfile(
    @Req() req,
    @Body() dto: CreatePatientProfileDto,
  ) {
    return this.patientService.createProfile(req.user, dto);
  }

  @Patch('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('PATIENT')
  updateProfile(
    @Req() req,
    @Body() dto: UpdatePatientProfileDto,
  ) {
    return this.patientService.updateProfile(req.user, dto);
  }
}