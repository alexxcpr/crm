import { AccessControlService } from './access-control.service';

describe('AccessControlService', () => {
  const service = new AccessControlService();

  it('acorda toate capabilitatile owner-ului', () => {
    expect(
      service.capabilitiesFor('platform_owner'),
    ).toEqual(
      expect.arrayContaining([
        'builder.manage',
        'tenant.manage',
        'access_levels.manage',
        'billing.manage',
        'data.manage_all',
      ]),
    );
  });

  it('nu acorda builder tenant adminului', () => {
    const capabilities =
      service.capabilitiesFor('tenant_admin');
    expect(capabilities).toContain('tenant.manage');
    expect(capabilities).toContain('data.manage_all');
    expect(capabilities).not.toContain(
      'builder.manage',
    );
  });

  it('rolul business admin nu acorda capabilitati globale', () => {
    expect(service.capabilitiesFor('user')).toEqual(
      [],
    );
  });

  it('nu accepta capabilitati injectate in payload pentru user', () => {
    expect(
      service.has(
        {
          accessLevel: 'user',
          globalCapabilities: [
            'builder.manage',
          ],
        },
        'builder.manage',
      ),
    ).toBe(false);
  });
});
