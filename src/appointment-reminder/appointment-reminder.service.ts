import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';

import { Appointment } from '../appointment/appointment.entity';
import { Notification } from '../notifications/notifications.entity';
import { MailService } from 'src/email/email.service';

@Injectable()
export class AppointmentReminderService {
  private readonly logger = new Logger(
    AppointmentReminderService.name,
  );

  constructor(
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  /**
   * Runs every 5 minutes.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async sendAppointmentReminders() {
    this.logger.log('Checking upcoming appointments for reminders...');

    try {
      const appointmentRepository =
        this.dataSource.getRepository(Appointment);

      const notificationRepository =
        this.dataSource.getRepository(Notification);

      const now = new Date();

      now.setSeconds(0, 0);

      // Reminder window = 1 hour from now
      const reminderStart = new Date(
        now.getTime() + 60 * 60 * 1000,
      );
      console.log(reminderStart)
      // 5 minute window
      const reminderEnd = new Date(
        reminderStart.getTime() + 5 * 60 * 1000,
      );
      console.log(reminderEnd)
      this.logger.log(
  `Reminder window: ${reminderStart.toISOString()} -> ${reminderEnd.toISOString()}`,
);
      const appointments = await appointmentRepository.find({
        where: {
          status: 'BOOKED',
        },
        relations: {
          patient: true,
          doctor: true,
          customSlot: true,
          recurringSlot: true,
          customAvailability: true,
          recurringAvailability: true,
        },
      });

      for (const appointment of appointments) {
        await this.processAppointmentReminder(
          appointment,
          reminderStart,
          reminderEnd,
          notificationRepository,
        );
      }

      this.logger.log(
        `Reminder check completed. Checked ${appointments.length} appointments.`,
      );
    } catch (error) {
      this.logger.error(
        'Failed to process appointment reminders',
        error,
      );
    }
  }

  private async processAppointmentReminder(
    appointment: Appointment,
    reminderStart: Date,
    reminderEnd: Date,
    notificationRepository: any,
  ) {
    if (!appointment.patient) {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: patient not found.`,
      );
      return;
    }

    if (!appointment.doctor) {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: doctor not found.`,
      );
      return;
    }

    // Get appointment start time depending on scheduling type.
    const startTime =
      appointment.customSlot?.startTime ||
      appointment.recurringSlot?.startTime ||
      appointment.customAvailability?.startTime ||
      appointment.recurringAvailability?.startTime;

    if (!startTime) {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: appointment time not found.`,
      );
      return;
    }

    // Combine appointment date + start time.
    const appointmentDateTime =
      this.combineDateAndTime(
        appointment.appointmentDate,
        startTime,
      );
      console.log(appointmentDateTime);

    // Check whether appointment falls inside reminder window
    if (
      appointmentDateTime < reminderStart ||
      appointmentDateTime >= reminderEnd
    ) {
      return;
    }

    /*
     * Prevent duplicate reminder.
     */
    const existingReminder =
      await notificationRepository.findOne({
        where: {
          appointment: {
            id: appointment.id,
          },
          type: 'APPOINTMENT_REMINDER',
        },
      });

    if (existingReminder) {
      this.logger.log(
        `Reminder already exists for appointment ${appointment.id}`,
      );

      return;
    }

    let title = 'Appointment Reminder';
    let message = '';

    /*
     * STREAM reminder
     */
    if (appointment.schedulingType === 'STREAM') {
      message =
        `Reminder: You have an appointment with ` +
        `Dr. ${appointment.doctor.fullName} ` +
        `on ${appointment.appointmentDate} ` +
        `at ${startTime}.`;
    }

    /*
     * WAVE reminder
     */
    else if (appointment.schedulingType === 'WAVE') {
      message =
        `Reminder: You have an appointment with ` +
        `Dr. ${appointment.doctor.fullName} today.\n` +
        `Reporting Time: ${startTime}\n` +
        `Token Number: ${appointment.tokenNumber}`;
    }

    else {
      this.logger.warn(
        `Skipping appointment ${appointment.id}: unknown scheduling type.`,
      );

      return;
    }

    //Create notification
    const notification =
    notificationRepository.create({
      patient: {
        id: appointment.patient.id,
      },
      appointment: {
        id: appointment.id,
      },
      type: 'APPOINTMENT_REMINDER',
      title,
      message,
      isRead: false,
    });

  const savedNotification =
    await notificationRepository.save(notification);

    this.logger.log(
      `Reminder created for appointment ${appointment.id}`,
    );

    // Send email ONLY after notification is successfully created
  try {
    await this.mailService.sendAppointmentReminderMail(
      appointment.patient.email,
      appointment.patient.fullName,
      appointment.doctor.fullName,
      appointment.appointmentDate,
      startTime,
      appointment.schedulingType,
      appointment.tokenNumber,
    );

    this.logger.log(
      `Reminder email sent to ${appointment.patient.email}`,
    );
  } catch (error) {
    this.logger.error(
      `Failed to send reminder email to ${appointment.patient.email}`,
      error,
    );
  }
  }

  private combineDateAndTime(
  appointmentDate: string | Date,
  time: string,
): Date {
  const dateString =
    appointmentDate instanceof Date
      ? appointmentDate.toISOString().split('T')[0]
      : appointmentDate;

  const [hours, minutes, seconds = '0'] =
    time.split(':');

  // IST = UTC+05:30
  return new Date(
    `${dateString}T${hours.padStart(2, '0')}:${minutes.padStart(
      2,
      '0',
    )}:${seconds.padStart(2, '0')}+05:30`,
  );
}

}