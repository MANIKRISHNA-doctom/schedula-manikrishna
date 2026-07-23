import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AvailabilityController } from './availability.controller';
import { AvailabilityService } from './availability.service';

import { RecurringAvailability } from './recurring-availability.entity';
import { CustomAvailability } from './custom-availability.entity';

import { User } from 'src/auth/user.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      RecurringAvailability,
      CustomAvailability,
    ]),
  ],

  controllers: [AvailabilityController],

  providers: [AvailabilityService],
})
export class AvailabilityModule {}