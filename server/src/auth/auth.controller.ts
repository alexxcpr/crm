import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthDto, SwitchProfileDto } from './dto';
import { AuthenticatedUser } from 'src/security/security.types';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { PublicRateLimitGuard } from 'src/security/public-rate-limit.guard';
import { PUBLIC_RATE_LIMITS } from 'src/security/public-rate-limit.constants';

@Controller('auth')
@UseGuards(PublicRateLimitGuard)
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @Throttle(PUBLIC_RATE_LIMITS.auth.signup)
  signup(@Body() dto: AuthDto) {
    return this.authService.signup(dto);
  }

  @Post('signin')
  @Throttle(PUBLIC_RATE_LIMITS.auth.signin)
  signin(@Body() dto: AuthDto) {
    return this.authService.signin(dto);
  }

  @Post('refresh')
  @Throttle(PUBLIC_RATE_LIMITS.auth.refresh)
  refresh(@Body('refreshToken') refreshToken: string) {
    if (!refreshToken) {
      return { statusCode: 400, message: 'refreshToken is required' };
    }
    return this.authService.refreshToken(refreshToken);
  }

  @Post('signout')
  @Throttle(PUBLIC_RATE_LIMITS.auth.signout)
  signout(@Body('refreshToken') refreshToken: string) {
    return this.authService.signout(refreshToken);
  }

  @Post('switch-profile')
  @SkipThrottle({ burst: true, sustained: true })
  @UseGuards(AuthGuard('jwt'))
  switchProfile(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() dto: SwitchProfileDto,
  ) {
    return this.authService.switchProfile(req.user.id, dto.profileId, dto.refreshToken);
  }
}
