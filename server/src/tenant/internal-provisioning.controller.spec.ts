import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InternalProvisioningController } from './internal-provisioning.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';

describe('InternalProvisioningController', () => {
  const dto = {
    tenantSlug: 'acme',
    companyName: 'Acme SRL',
    adminName: 'Ion Popescu',
    adminEmail: 'ion@acme.ro',
    plan: 'starter',
    maxUsers: 100,
    stripeCustomerId: 'cus_123',
    stripeSubscriptionId: 'sub_123',
    stripeCheckoutSessionId: 'cs_123',
  };

  function createController(secret?: string) {
    const configuredSecret = arguments.length === 0 ? 'expected-secret' : secret;
    const config = {
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'PROVISIONING_INTERNAL_SECRET') return configuredSecret;
        if (key === 'DOMAIN_BASE') return 'stanciulescu.xyz';
        return fallback;
      }),
    } as unknown as ConfigService;
    const provisioning = {
      provision: jest.fn().mockResolvedValue({ slug: 'acme', dbName: 'acme' }),
      checkAvailability: jest.fn().mockResolvedValue({ available: true }),
      getProvisioningStatus: jest.fn().mockResolvedValue({
        status: 'provisioned',
        tenantSlug: 'acme',
        appUrl: 'https://acme.stanciulescu.xyz',
      }),
      setAdminCredentials: jest.fn().mockResolvedValue({ slug: 'acme' }),
    } as unknown as TenantProvisioningService;

    return {
      controller: new InternalProvisioningController(config, provisioning),
      provisioning,
    };
  }

  it('rejects requests without the provisioning secret', async () => {
    const { controller } = createController();

    await expect(controller.provision(undefined, dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects requests with the wrong provisioning secret', async () => {
    const { controller } = createController();

    await expect(controller.provision('wrong-secret', dto)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('fails closed when the expected secret is not configured', async () => {
    const { controller } = createController(undefined);

    await expect(controller.provision('any-secret', dto)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('provisions a tenant and returns the public tenant URL', async () => {
    const { controller, provisioning } = createController();

    await expect(controller.provision('expected-secret', dto)).resolves.toEqual({
      success: true,
      data: {
        tenantSlug: 'acme',
        dbName: 'acme',
        appUrl: 'https://acme.stanciulescu.xyz',
      },
    });
    expect(provisioning.provision).toHaveBeenCalledWith(dto);
  });

  it('checks tenant availability with the shared provisioning secret', async () => {
    const { controller, provisioning } = createController();

    await expect(controller.availability('expected-secret', { slug: 'acme' })).resolves.toEqual({
      success: true,
      data: { available: true },
    });
    expect(provisioning.checkAvailability).toHaveBeenCalledWith('acme');
  });

  it('rejects availability requests without the shared secret', async () => {
    const { controller } = createController();

    await expect(controller.availability(undefined, { slug: 'acme' })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns a client-safe provisioning status', async () => {
    const { controller, provisioning } = createController();

    await expect(controller.status('expected-secret', 'acme')).resolves.toEqual({
      success: true,
      data: {
        status: 'provisioned',
        tenantSlug: 'acme',
        appUrl: 'https://acme.stanciulescu.xyz',
      },
    });
    expect(provisioning.getProvisioningStatus).toHaveBeenCalledWith('acme');
  });

  it('rejects status requests with the wrong shared secret', async () => {
    const { controller } = createController();

    await expect(controller.status('wrong-secret', 'acme')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('sets the admin credentials with the shared provisioning secret', async () => {
    const { controller, provisioning } = createController();
    const body = {
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    };

    await expect(controller.setAdminCredentials('expected-secret', 'acme', body)).resolves.toEqual({
      success: true,
      data: {
        tenantSlug: 'acme',
        appUrl: 'https://acme.stanciulescu.xyz',
      },
    });
    expect(provisioning.setAdminCredentials).toHaveBeenCalledWith({
      slug: 'acme',
      ...body,
    });
  });

  it('rejects admin credentials requests without the shared secret', async () => {
    const { controller } = createController();

    await expect(controller.setAdminCredentials(undefined, 'acme', {
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
