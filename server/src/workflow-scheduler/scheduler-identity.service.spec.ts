import { SchedulerIdentityService } from './scheduler-identity.service';

describe('SchedulerIdentityService', () => {
  it('construieste actorul tehnic tenant_admin', async () => {
    const row = {
      id: 'scheduler-user',
      login_username: 'scheduler',
      must_change_password: false,
      user_is_active: false,
      id_profile: 'scheduler-profile',
      id_user: 'scheduler-user',
      username: 'scheduler',
      email: 'scheduler@moduvis.system',
      display_name: 'Scheduler Moduvis',
      access_level: 'tenant_admin',
      is_default: true,
      is_active: true,
    };
    const query: any = {
      join: jest.fn(() => query),
      where: jest.fn(() => query),
      select: jest.fn(() => query),
      first: jest.fn().mockResolvedValue(row),
    };
    const service = new SchedulerIdentityService(
      {
        knex: jest.fn(() => query),
        slug: 'demo',
        dbName: 'demo',
      } as any,
      {
        normalizeAccessLevel: jest
          .fn()
          .mockReturnValue('tenant_admin'),
        capabilitiesFor: jest
          .fn()
          .mockReturnValue(['builder.manage']),
      } as any,
    );

    const actor = await service.actor();

    expect(actor).toEqual(
      expect.objectContaining({
        id: 'scheduler-user',
        profileId: 'scheduler-profile',
        accessLevel: 'tenant_admin',
        tenant: 'demo',
        dbName: 'demo',
      }),
    );
    expect(actor.profile.access_level).toBe(
      'tenant_admin',
    );
  });
});
