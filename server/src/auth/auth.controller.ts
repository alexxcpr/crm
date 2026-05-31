import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  signup(@Body() dto: AuthDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  signin(@Body() dto: AuthDto) {
    return this.authService.signin(dto);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      return { statusCode: 400, message: 'refreshToken is required' };
    }
    return this.authService.refreshToken(refreshToken);
  }

  @Post('signout')
  signout(@Body('refreshToken') refreshToken: string) {
    return this.authService.signout(refreshToken);
  }
}
