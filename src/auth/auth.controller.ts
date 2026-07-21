import {
Controller,
Post,
Body
} from '@nestjs/common';

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
signin(
@Body() dto:SigninDto
){

return this.authService.signin(dto);

}


}