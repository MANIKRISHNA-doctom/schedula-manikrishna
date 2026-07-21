import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { User } from 'src/users/users.entity';
import { Doctor } from 'src/doctor/doctor.entity';
import { JwtStrategy } from './jwt.strategy';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Doctor]),

    JwtModule.register({
      secret: 'hospital_secret_key',
      signOptions: {
        expiresIn: '3h',
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,
    RolesGuard
  ],
})
export class AuthModule {}