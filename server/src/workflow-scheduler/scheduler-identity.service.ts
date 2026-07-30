import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AccessControlService } from 'src/security/access-control.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';

@Injectable()
export class SchedulerIdentityService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly access: AccessControlService,
  ) {}

  async actor(): Promise<AuthenticatedUser> {
    const row = await this.tenantContext
      .knex('profile')
      .join('user', 'profile.id_user', 'user.id')
      .where({
        'profile.username': 'scheduler',
        'profile.is_system': true,
        'profile.is_active': true,
        'user.is_system': true,
      })
      .select(
        'profile.*',
        'user.id',
        'user.login_username',
        'user.must_change_password',
        'user.is_active as user_is_active',
      )
      .first();
    if (!row) {
      throw new ServiceUnavailableException(
        'Profilul tehnic scheduler nu este disponibil.',
      );
    }
    const accessLevel =
      this.access.normalizeAccessLevel(
        row.access_level,
      );
    return {
      id: row.id,
      login_username: row.login_username,
      must_change_password:
        row.must_change_password,
      is_active: row.user_is_active,
      profile: {
        id_profile: row.id_profile,
        id_user: row.id_user,
        username: row.username,
        email: row.email,
        display_name: row.display_name,
        access_level: accessLevel,
        is_default: row.is_default,
        is_active: row.is_active,
      },
      profileId: row.id_profile,
      roles: [],
      accessLevel,
      globalCapabilities:
        this.access.capabilitiesFor(accessLevel),
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
    };
  }
}
