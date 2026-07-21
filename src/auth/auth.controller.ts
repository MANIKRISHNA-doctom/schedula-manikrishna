import {
Controller,
Post,
Body,
Res
} from '@nestjs/common';
import type { Response } from 'express';

import { AuthService } from './auth.service';

import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';



@Controller('auth')
export class AuthController {


constructor(
private authService:AuthService
){}



@Post('signup')
signup(
@Body() dto:SignupDto
){

return this.authService.signup(dto);

}

@Post('signin')
async signin(
  @Body() dto: SigninDto,
  @Res({ passthrough: true }) response: Response,
) {
  const result = await this.authService.signin(dto);

  response.cookie('access_token', result.accessToken, {
    httpOnly: true,
    secure: false, // true in production (HTTPS)
    sameSite: 'lax',
    maxAge: 3 * 60 * 60 * 1000, // 3 hours
  });

  return {
    message: result.message,
    user: result.user,
  };
}




}