import {
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AccessControlService } from 'src/security/access-control.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { IntegrationScope } from './integration-token.types';

@Injectable()
export class AuthenticatedUserService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly access: AccessControlService,
  ) {}

  async load(
    userId: string,
    profileId: string,
    auth?: {
      type: 'jwt' | 'integration_token';
      integrationTokenId?: string;
      integrationScopes?: IntegrationScope[];
    },
  ): Promise<AuthenticatedUser> {
    const knex = this.tenantContext.knex;
    const user = await knex('user')
      .where({ id: userId, is_active: true })
      .first();
    const profile = await knex('profile')
      .where({
        id_profile: profileId,
        id_user: userId,
        is_active: true,
      })
      .first();

    if (!user || !profile) {
      throw new UnauthorizedException();
    }

    const roles = await knex('profile_role')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .where('profile_role.id_profile', profile.id_profile)
      .whereNotIn('role.slug', [
        'admin',
        'platform_owner',
        'tenant_admin',
      ])
      .select('role.slug');
    const accessLevel = this.access.normalizeAccessLevel(
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
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
      authType: auth?.type ?? 'jwt',
      integrationTokenId: auth?.integrationTokenId,
      integrationScopes: auth?.integrationScopes,
    };
  }
}
