import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { JwtPayload } from 'src/types/entities';
import { AccessControlService } from 'src/security/access-control.service';

const cookieExtractor = (req: Request): string | null => req.cookies?.['auth.token'] ?? null;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly tenantContext: TenantContext,
    private readonly access: AccessControlService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor, ExtractJwt.fromAuthHeaderAsBearerToken()]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') as string,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.profileId) throw new UnauthorizedException('Sesiune veche. Autentifica-te din nou.');
    const knex = this.tenantContext.knex;
    const user = await knex('user').where({ id: payload.sub, is_active: true }).first();
    const profile = await knex('profile').where({ id_profile: payload.profileId, id_user: payload.sub, is_active: true }).first();
    if (!user || !profile) throw new UnauthorizedException();
    const roles = await knex('profile_role')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .where('profile_role.id_profile', profile.id_profile)
      .whereNotIn('role.slug', [
        'admin',
        'platform_owner',
        'tenant_admin',
      ])
      .select('role.slug');
    const accessLevel =
      this.access.normalizeAccessLevel(
        profile.access_level,
      );
    const { hash: _, ...safeUser } = user;
    return {
      ...safeUser,
      profile,
      profileId: profile.id_profile,
      roles: roles.map((row: { slug: string }) => row.slug),
      accessLevel,
      globalCapabilities:
        this.access.capabilitiesFor(accessLevel),
      tenant: payload.tenant,
      dbName: payload.dbName,
    };
  }
}
