import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

import { User } from 'src/users/users.entity';
import { Doctor } from 'src/doctor/doctor.entity';

import { SignupDto } from './dto/signup.dto';
import { SigninDto } from './dto/signin.dto';


@Injectable()
export class AuthService {

constructor(

@InjectRepository(User)
private userRepository: Repository<User>,


@InjectRepository(Doctor)
private doctorRepository: Repository<Doctor>

){}


// SIGNUP

async signup(dto: SignupDto){

const hashedPassword = await bcrypt.hash(dto.password,10);


if(dto.role === 'DOCTOR'){


const doctor = this.doctorRepository.create({

fullName:dto.fullName,

email:dto.email,

mobileNumber:dto.mobileNumber,

password:hashedPassword,

specialization:dto.specialization,

experience:dto.experience

});


return this.doctorRepository.save(doctor);


}


// PATIENT

const user = this.userRepository.create({

fullName:dto.fullName,

email:dto.email,

mobileNumber:dto.mobileNumber,

password:hashedPassword

});


return this.userRepository.save(user);

}



// SIGNIN

async signin(dto:SigninDto){


let account;


account = await this.userRepository.findOne({
where:{
email:dto.email
}
});


if(!account){

account = await this.doctorRepository.findOne({
where:{
email:dto.email
}
});

}


if(!account){

throw new BadRequestException(
'Invalid email or password'
);

}



const isPasswordValid = await bcrypt.compare(
dto.password,
account.password
);


if(!isPasswordValid){

throw new BadRequestException(
'Invalid email or password'
);

}


return {
message:"Login successful",
user:account
};


}


}