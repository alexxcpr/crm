import { ForbiddenException } from '@nestjs/common';
import { AuthorizationService } from './authorization.service';
import { AuthenticatedUser } from './security.types';

function actor(roles: string[] = ['user']): AuthenticatedUser {
  return {
    id: 'user-1',
    login_username: 'demo',
    must_change_password: false,
    is_active: true,
    profileId: 'profile-1',
    profile: {
      id_profile: 'profile-1', id_user: 'user-1', username: 'demo', email: 'demo@example.com',
      display_name: null, is_default: true, is_active: true,
    },
    roles,
    tenant: 'dev',
    dbName: 'devdb',
  };
}

function serviceWithRows(rows: Array<{ scope: string | null, action: string }>) {
  const query: any = {
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    whereIn: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
  const knex: any = jest.fn(() => query);
  return new AuthorizationService({ knex } as any);
}

describe('AuthorizationService', () => {
  it('admin primeste scope all fara query', async () => {
    expect(await serviceWithRows([]).getScope(actor(['admin']), 'entity-1', 'delete')).toBe('all');
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
    const user = actor(['admin']);
    user.must_change_password = true;
    expect(await serviceWithRows([]).getScope(user, 'entity-1', 'read')).toBeNull();
  });
});
