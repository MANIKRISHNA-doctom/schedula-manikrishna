import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Notification } from './notifications.entity';
import { User } from '../auth/user.entity';
import { error } from 'console';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // GET PATIENT NOTIFICATIONS

  async getPatientNotifications(user: any) {
    const patient = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    const notifications = await this.notificationRepository.find({
      where: {
        patient: {
          id: patient.id,
        },
      },
      relations: {
        appointment: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return {
      message: 'Notifications fetched successfully.',

      unreadCount: notifications.filter(
        (notification) => !notification.isRead,
      ).length,

      data: notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        appointmentId: notification.appointment?.id ?? null,
        isRead: notification.isRead,
      })),
    };
  }

  // MARK NOTIFICATION AS READ
  async markNotificationAsRead(
    user: any,
    notificationId: string,
  ) {
    const patient = await this.userRepository.findOne({
      where: {
        id: user.sub,
        role: 'PATIENT',
      },
    });

    if (!patient) {
      throw new NotFoundException('Patient not found.');
    }

    const notification =
      await this.notificationRepository.findOne({
        where: {
          id: notificationId,
          patient: {
            id: patient.id,
          },
        },
        relations : {
            patient : true
        }
      });

    if (!notification) {
      throw new NotFoundException(
        'Notification not found.',
      );
    }

     if(notification.patient.id !== user.sub){
         throw new ForbiddenException(
          'You are not allowed to access this notification',
        );
    }
    // Already read
    if (notification.isRead) {
      return {
        message: 'Notification is already marked as read.',
        data: {
          id: notification.id,
          isRead: notification.isRead,
        },
      };
    }

    notification.isRead = true;

    await this.notificationRepository.save(notification);

    return {
      message: 'Notification marked as read successfully.',
      data: {
        id: notification.id,
        isRead: notification.isRead,
      },
    };
  }

   // Delete notification
  async deleteNotification(user: any, notificationId: string) {
    const notification = await this.notificationRepository.findOne({
      where: {
        id: notificationId,
        patient: {
          id: user.sub,
        },
      },
      relations : {
        patient : true
      }
    });

    if (!notification) {
      throw new NotFoundException('Notification not found.');
    }

    if(notification.patient.id !== user.sub){
         throw new ForbiddenException(
          'You are not allowed to delete this notification',
        );
    }

    await this.notificationRepository.remove(notification);

    return {
      message: 'Notification deleted successfully.',
      data: {
        id: notificationId,
      },
    };
  }
}