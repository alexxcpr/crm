import { AccessControlService } from 'src/security/access-control.service';
import { AuthenticatedUserService } from './authenticated-user.service';

describe('AuthenticatedUserService', () => {
  it('incarca userul, profilul si rolurile printr-o singura interogare', async () => {
    const rows = [
      {
        id: 'user-1', login_username: 'demo', must_change_password: false, is_active: true,
        id_profile: 'profile-1', id_user: 'user-1', username: 'demo', email: 'demo@example.com',
        display_name: 'Demo', access_level: 'user', is_default: true, profile_is_active: true,
        role_slug: 'sales',
      },
      {
        id: 'user-1', login_username: 'demo', must_change_password: false, is_active: true,
        id_profile: 'profile-1', id_user: 'user-1', username: 'demo', email: 'demo@example.com',
        display_name: 'Demo', access_level: 'user', is_default: true, profile_is_active: true,
        role_slug: 'admin',
      },
    ];
    const query: any = {
      join: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue(rows),
    };
    const knex: any = jest.fn(() => query);
    const service = new AuthenticatedUserService(
      { knex, slug: 'dev', dbName: 'devdb' } as any,
      new AccessControlService(),
    );

    const user = await service.load('user-1', 'profile-1');

    expect(knex).toHaveBeenCalledTimes(1);
    expect(user.profile.id_profile).toBe('profile-1');
    expect(user.roles).toEqual(['sales']);
  });
});
