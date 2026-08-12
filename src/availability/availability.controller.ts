import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';

import { AvailabilityService } from './availability.service';

import { CreateRecurringAvailabilityDto } from './dto/create-recurring-availability.dto';
import { UpdateRecurringAvailabilityDto } from './dto/update-recurring-availability.dto';
import { CreateCustomAvailabilityDto } from './dto/create-custom-availability.dto';
import { UpdateCustomAvailabilityDto } from './dto/update-custom-availability.dto';
import { ExpandShrinkAvailabilityDto } from './dto/expand-shrink-availability.dto';

@Controller('doctor/availability')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('DOCTOR')
export class AvailabilityController {
  constructor(private readonly availabilityService: AvailabilityService) {}

  @Post()
  createRecurring(@Req() req, @Body() dto: CreateRecurringAvailabilityDto) {
    return this.availabilityService.createRecurring(req.user, dto);
  }

  @Get()
  async getAvailability(@Req() req) {
    return this.availabilityService.getAvailability(req.user);
  }

  @Patch(':id')
  updateRecurring(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateRecurringAvailabilityDto,
  ) {
    return this.availabilityService.updateRecurring(req.user, id, dto);
  }

  @Delete(':id')
  deleteRecurring(@Req() req, @Param('id') id: string) {
    return this.availabilityService.deleteRecurring(req.user, id);
  }

  @Patch(':id/expand')
  expandRecurring(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ExpandShrinkAvailabilityDto,
  ) {
    return this.availabilityService.expandRecurring(req.user, id, dto);
  }

  @Patch('custom/:id/expand')
  expandCustom(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ExpandShrinkAvailabilityDto,
  ) {
    return this.availabilityService.expandCustom(req.user, id, dto);
  }

  @Patch(':id/shrink')
  async shrinkRecurring(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ExpandShrinkAvailabilityDto,
  ) {
    return this.availabilityService.shrinkRecurring(req.user, id, dto);
  }

  @Patch('custom/:id/shrink')
  async shrinkCustom(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: ExpandShrinkAvailabilityDto,
  ) {
    return this.availabilityService.shrinkCustom(req.user, id, dto);
  }

  @Post('override')
  createOverride(@Req() req, @Body() dto: CreateCustomAvailabilityDto) {
    return this.availabilityService.createOverride(req.user, dto);
  }

  @Patch('custom/:id')
  async updateCustomAvailability(
    @Req() req,
    @Param('id') id: string,
    @Body() dto: UpdateCustomAvailabilityDto,
  ) {
    return this.availabilityService.updateOverride(req.user, id, dto);
  }

  @Get('date')
  getAvailabilityByDate(@Req() req, @Query('date') date: string) {
    return this.availabilityService.getAvailabilityByDate(req.user, date);
  }
}
