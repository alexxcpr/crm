import { ForbiddenException } from '@nestjs/common';
import { AccessControlService } from './access-control.service';
import { AuthorizationService } from './authorization.service';
import { AuthenticatedUser } from './security.types';

function actor(
  accessLevel: AuthenticatedUser['accessLevel'] = 'user',
): AuthenticatedUser {
  const access = new AccessControlService();
  return {
    id: 'user-1',
    login_username: 'demo',
    must_change_password: false,
    is_active: true,
    profileId: 'profile-1',
    profile: {
      id_profile: 'profile-1', id_user: 'user-1', username: 'demo', email: 'demo@example.com',
      display_name: null, access_level: accessLevel, is_default: true, is_active: true,
    },
    roles: ['user'],
    accessLevel,
    globalCapabilities: access.capabilitiesFor(accessLevel),
    tenant: 'dev',
    dbName: 'devdb',
  };
}

function serviceWithRows(rows: Array<{ scope: string | null, action: string }>) {
  const query: any = {
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereNotIn: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
  const knex: any = jest.fn(() => query);
  return new AuthorizationService(
    { knex } as any,
    new AccessControlService(),
  );
}

describe('AuthorizationService', () => {
  it('tenant admin primeste scope all fara query', async () => {
    expect(await serviceWithRows([]).getScope(actor('tenant_admin'), 'entity-1', 'delete')).toBe('all');
  });

  it('all domina owner cand rolurile sunt aditive', async () => {
    const service = serviceWithRows([{ scope: 'owner', action: 'read' }, { scope: 'all', action: 'read' }]);
    expect(await service.getScope(actor(), 'entity-1', 'read')).toBe('all');
  });

  it('pastreaza owner cand nu exista regula all', async () => {
    expect(await serviceWithRows([{ scope: 'owner', action: 'update' }]).getScope(actor(), 'entity-1', 'update')).toBe('owner');
  });

  it('blocheaza accesul in lipsa permisiunii', async () => {
    await expect(serviceWithRows([]).require(actor(), 'entity-1', 'delete')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aplica filtrul de profil pentru scope owner', () => {
    const query = { where: jest.fn().mockReturnThis() } as any;
    serviceWithRows([]).applyScope(query, 'ent_contacts', 'owner', 'profile-1');
    expect(query.where).toHaveBeenCalledWith('ent_contacts.id_profile', 'profile-1');
  });

  it('blocheaza permisiunile pana la schimbarea parolei temporare', async () => {
    const user = actor('platform_owner');
    user.must_change_password = true;
    expect(await serviceWithRows([]).getScope(user, 'entity-1', 'read')).toBeNull();
  });

  function bulkService(rows: Array<{ entity_slug: string, action: string | null, scope: 'all' | 'owner' | null }>) {
    const permissionQuery: any = {
      join: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      whereNotIn: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      as: jest.fn().mockReturnValue('permission-subquery'),
    };
    const entityQuery: any = {
      leftJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(rows),
    };
    const knex: any = jest.fn((table: string) => table.startsWith('profile_role') ? permissionQuery : entityQuery);
    return {
      service: new AuthorizationService({ knex } as any, new AccessControlService()),
      knex,
    };
  }

  it('calculeaza toate capabilitatile entitatilor cu o singura interogare bulk', async () => {
    const { service, knex } = bulkService([
      { entity_slug: 'contacts', action: 'read', scope: 'owner' },
      { entity_slug: 'contacts', action: 'manage', scope: 'all' },
      { entity_slug: 'companies', action: null, scope: null },
    ]);

    const capabilities = await service.capabilitiesForAllEntities(actor());

    expect(capabilities.contacts).toEqual({
      read: 'all', create: 'all', update: 'all', delete: 'all', manage: 'all', change_ownership: null,
    });
    expect(capabilities.companies).toEqual({
      read: null, create: null, update: null, delete: null, manage: null, change_ownership: null,
    });
    expect(knex).toHaveBeenCalledTimes(2); // subquery + o singura executie SQL pentru entitati
  });

  it('acorda all fara query-uri de permisiuni pentru tenant admin', async () => {
    const { service, knex } = bulkService([
      { entity_slug: 'contacts', action: null, scope: null },
    ]);

    const capabilities = await service.capabilitiesForAllEntities(actor('tenant_admin'));

    expect(Object.values(capabilities.contacts)).toEqual(['all', 'all', 'all', 'all', 'all', 'all']);
    expect(knex).toHaveBeenCalledTimes(1);
  });

  it('returneaza capabilitati nule pentru parola temporara', async () => {
    const { service } = bulkService([
      { entity_slug: 'contacts', action: null, scope: null },
    ]);
    const user = actor('tenant_admin');
    user.must_change_password = true;

    const capabilities = await service.capabilitiesForAllEntities(user);

    expect(Object.values(capabilities.contacts)).toEqual([null, null, null, null, null, null]);
  });
});
