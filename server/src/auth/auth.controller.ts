import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthDto, SwitchProfileDto } from './dto';
import { AuthenticatedUser } from 'src/security/security.types';

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

  @Post('switch-profile')
  @UseGuards(AuthGuard('jwt'))
  switchProfile(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: SwitchProfileDto,
  ) {
    return this.authService.switchProfile(req.user.id, dto.profileId, dto.refreshToken);
  }
}
