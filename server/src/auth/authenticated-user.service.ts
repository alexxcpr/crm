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
    const rows = await knex('user as u')
      .join('profile as p', function joinCurrentProfile() {
        this.on('p.id_user', '=', 'u.id')
          .andOnVal('p.id_profile', '=', profileId)
          .andOnVal('p.is_active', '=', true);
      })
      .leftJoin('profile_role as pr', 'pr.id_profile', 'p.id_profile')
      .leftJoin('role as r', 'r.id_role', 'pr.id_role')
      .where('u.id', userId)
      .where('u.is_active', true)
      .select(
        'u.id',
        'u.date_created as user_date_created',
        'u.date_updated as user_date_updated',
        'u.login_username',
        'u.must_change_password',
        'u.is_active',
        'u.is_system as user_is_system',
        'p.id_profile',
        'p.id_user',
        'p.username',
        'p.email',
        'p.display_name',
        'p.access_level',
        'p.is_default',
        'p.is_active as profile_is_active',
        'p.is_system as profile_is_system',
        'p.date_created as profile_date_created',
        'p.date_updated as profile_date_updated',
        'r.slug as role_slug',
      );

    const first = rows[0];
    if (!first) {
      throw new UnauthorizedException();
    }

    const excludedRoles = new Set(['admin', 'platform_owner', 'tenant_admin']);
    const roles = [...new Set(
      rows
        .map((row: { role_slug?: string | null }) => row.role_slug)
        .filter((slug: string | null | undefined): slug is string => Boolean(slug) && !excludedRoles.has(slug!)),
    )];
    const profile = {
      id_profile: first.id_profile,
      id_user: first.id_user,
      username: first.username,
      email: first.email,
      display_name: first.display_name,
      access_level: first.access_level,
      is_default: first.is_default,
      is_active: first.profile_is_active,
      is_system: first.profile_is_system,
      date_created: first.profile_date_created,
      date_updated: first.profile_date_updated,
    };
    const accessLevel = this.access.normalizeAccessLevel(
      profile.access_level,
    );

    return {
      id: first.id,
      date_created: first.user_date_created,
      date_updated: first.user_date_updated,
      login_username: first.login_username,
      must_change_password: first.must_change_password,
      is_active: first.is_active,
      is_system: first.user_is_system,
      profile,
      profileId: profile.id_profile,
      roles,
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
