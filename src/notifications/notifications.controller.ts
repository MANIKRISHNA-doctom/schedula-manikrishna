import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Req,
  Body,
  Delete,
  UseGuards,
} from '@nestjs/common';

import { AuthGuard } from '@nestjs/passport';

import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { NotificationsService } from './notifications.service';


@Controller('patient/notifications')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('PATIENT')
export class NotificationsController {
    constructor(
        private readonly NotificationsService : NotificationsService,
      ) {}

      
    @Get()
    async getPatientNotifications(@Req() req: any) {
      return this.NotificationsService.getPatientNotifications(req.user);
    }

    @Patch('/:id/markread')
    async markNotificationAsRead(
    @Req() req: any,
    @Param('id') notificationId: string,
    ) {
        return this.NotificationsService.markNotificationAsRead(
            req.user,
            notificationId,
        );
    }
    @Delete(':id')
    async deleteNotification(
        @Req() req,
        @Param('id') notificationId: string,
    ) {
        return this.NotificationsService.deleteNotification(
        req.user,
        notificationId,
        );

        }
    }

