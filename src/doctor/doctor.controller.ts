import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('doctor')
export class DoctorController {

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('DOCTOR')
  getProfile(@Req() req) {

    return {
      message: 'Doctor Profile',
      user: req.user,
    };

  }

}