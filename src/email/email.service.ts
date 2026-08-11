// mail.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
  ) {}

  async sendAppointmentBookedMail(
    email: string,
    patientName: string,
    doctorName: string,
    appointmentDate: string,
    appointmentTime: string,
  ) {
    return this.sendAppointmentMail({
      email,
      subject: 'Appointment Booked Successfully',
      title: 'Appointment Booked',
      message: `Your appointment with Dr. ${doctorName} has been booked successfully.`,
      details: `
        Date: ${appointmentDate}
        Time: ${appointmentTime}
      `,
    });
  }

  async sendAppointmentCancelledMail(
    email: string,
    patientName: string,
    doctorName: string,
    appointmentDate: string,
    appointmentTime: string,
  ) {
    return this.sendAppointmentMail({
      email,
      subject: 'Appointment Cancelled',
      title: 'Appointment Cancelled',
      message: `Your appointment with Dr. ${doctorName} has been cancelled.`,
      details: `
        Date: ${appointmentDate}
        Time: ${appointmentTime}
      `,
    });
  }

  async sendAppointmentRescheduledMail(
    email: string,
    patientName: string,
    doctorName: string,
    appointmentDate: string,
    appointmentTime: string,
  ) {
    return this.sendAppointmentMail({
      email,
      subject: 'Appointment Rescheduled',
      title: 'Appointment Rescheduled',
      message: `Your appointment with Dr. ${doctorName} has been rescheduled.`,
      details: `
        New Date: ${appointmentDate}
        New Time: ${appointmentTime}
      `,
    });
  }

  private async sendAppointmentMail(data: {
    email: string;
    subject: string;
    title: string;
    message: string;
    details: string;
  }) {
    try {
      await this.mailerService.sendMail({
        to: data.email,
        subject: data.subject,

        html: `
          <div style="font-family: Arial, sans-serif;">
            <h2>${data.title}</h2>

            <p>Hello,</p>

            <p>${data.message}</p>

            <p>
              ${data.details.replace(/\n/g, '<br>')}
            </p>

            <p>
              Thank you,<br>
              Doctor Appointment System
            </p>
          </div>
        `,
      });

      this.logger.log(
        `Appointment email sent to ${data.email}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to send appointment email to ${data.email}`,
        error,
      );

      throw error;
    }
  }
}