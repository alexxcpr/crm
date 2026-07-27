import {
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlService } from './access-control.service';
import { CapabilityGuard } from './capability.guard';

function context(user: any) {
  return {
    getHandler: () => ({ handler: true }),
    getClass: () => ({ controller: true }),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

describe('CapabilityGuard', () => {
  const access = new AccessControlService();

  function guard(capability: string) {
    const reflector = {
      getAllAndMerge: jest
        .fn()
        .mockReturnValue([capability]),
    } as unknown as Reflector;
    return new CapabilityGuard(reflector, access);
  }

  function actor(
    accessLevel:
      | 'platform_owner'
      | 'tenant_admin'
      | 'user',
  ) {
    return {
      accessLevel,
      globalCapabilities:
        access.capabilitiesFor(accessLevel),
      must_change_password: false,
    };
  }

  it('permite builder-ul numai owner-ului', () => {
    expect(
      guard('builder.manage').canActivate(
        context(actor('platform_owner')),
      ),
    ).toBe(true);
    expect(() =>
      guard('builder.manage').canActivate(
        context(actor('tenant_admin')),
      ),
    ).toThrow(ForbiddenException);
  });

  it('permite administrarea tenantului tenant adminului', () => {
    expect(
      guard('tenant.manage').canActivate(
        context(actor('tenant_admin')),
      ),
    ).toBe(true);
  });

  it('blocheaza utilizatorii business din zonele globale', () => {
    expect(() =>
      guard('tenant.manage').canActivate(
        context(actor('user')),
      ),
    ).toThrow(ForbiddenException);
  });
});
