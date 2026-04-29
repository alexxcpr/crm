import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { JwtPayload } from 'src/types/entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly tenantContext: TenantContext,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  // Daca token-ul este valid, Passport apeleaza automat aceasta functie
  // cu payload-ul decriptat
  async validate(payload: JwtPayload) {
    const knex = this.tenantContext.knex;

    const user = await knex('user')
      .where('id', payload.sub)
      .first();

    if (!user) {
      throw new UnauthorizedException();
    }

    const userRoles = await knex('user_role')
      .join('role', 'user_role.id_role', 'role.id_role')
      .where('user_role.id_user', user.id)
      .select('role.slug');

    const { hash: _, ...userWithoutHash } = user;

    return {
      ...userWithoutHash,
      roles: userRoles.map((ur: { slug: string }) => ur.slug),
      tenant: payload.tenant,
      dbName: payload.dbName,
    };
  }
}
