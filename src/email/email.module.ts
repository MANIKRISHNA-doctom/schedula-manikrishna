import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailService } from './email.service';

@Module({
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        transport: {
          host: configService.get<string>('MAIL_HOST'),

          port: Number(
            configService.get<string>('MAIL_PORT'),
          ),

          secure:
            configService.get<string>('MAIL_SECURE') === 'true',

          auth: {
            user: configService.get<string>('MAIL_USER'),
            pass: configService.get<string>('MAIL_PASSWORD'),
          },

          tls: {
            rejectUnauthorized: false,
          },
        },

        defaults: {
          from: `"Doctor Appointment System" <${configService.get<string>(
            'MAIL_USER',
          )}>`,
        },
      }),
    }),
  ],

  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}