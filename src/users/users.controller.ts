import {
  Controller,
  Get,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

@Controller('patient')
export class UsersController {

  @Get('profile')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('PATIENT')
  getProfile(@Req() req) {

    return {
      message: 'Patient Profile',
      user: req.user,
    };

  }

}