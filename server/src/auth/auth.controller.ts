import { Body, Controller, Post } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AuthDto } from "./dto";

@Controller ('auth')
export class AuthController {
    constructor(private authService: AuthService) {}

    // auth/signup
    @Post('signup')
    signup (@Body() dto: AuthDto){
        console.log('signup:' + dto.email + " |||" + dto.password) 
        return this.authService.signup(dto);
    }

    // auth/signin
    @Post('signin')
    signin (@Body() dto: AuthDto) {
        console.log('signin:' + dto.email + " |||" + dto.password)
        return this.authService.signin(dto);
    }

}