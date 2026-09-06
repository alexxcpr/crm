import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from 'src/types/entities';
import { AuthenticatedUserService } from '../authenticated-user.service';

const cookieExtractor = (req: Request): string | null => req.cookies?.['auth.token'] ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly authenticatedUsers: AuthenticatedUserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.profileId) throw new UnauthorizedException('Sesiune veche. Autentifica-te din nou.');
    const user = await this.authenticatedUsers.load(payload.sub, payload.profileId, {
      type: 'jwt',
    });
    return { ...user, sessionExp: payload.sessionExp ?? payload.exp };
  }
}
