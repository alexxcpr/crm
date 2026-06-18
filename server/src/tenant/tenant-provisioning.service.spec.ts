import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaDbService } from './meta-db.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

describe('TenantProvisioningService', () => {
  let service: TenantProvisioningService;

  beforeEach(() => {
    const config = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;
    const metaDb = {
      knex: jest.fn(),
    } as unknown as MetaDbService;

    service = new TenantProvisioningService(config, metaDb);
  });

  function mockProvisioningSteps(existing: any) {
    const serviceAny = service as any;
    return {
      findTenantRegistry: jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue(existing),
      reserveTenantRegistry: jest.spyOn(serviceAny, 'reserveTenantRegistry').mockResolvedValue(undefined),
      ensureDatabase: jest.spyOn(serviceAny, 'ensureDatabase').mockResolvedValue(undefined),
      runTenantMigrations: jest.spyOn(serviceAny, 'runTenantMigrations').mockResolvedValue(undefined),
      seedAdminUser: jest.spyOn(serviceAny, 'seedAdminUser').mockResolvedValue(undefined),
      markTenantProvisioned: jest.spyOn(serviceAny, 'markTenantProvisioned').mockResolvedValue(undefined),
      markTenantProvisioningFailed: jest.spyOn(serviceAny, 'markTenantProvisioningFailed').mockResolvedValue(undefined),
    };
  }

  it('creates a new tenant registry, database, migrations, and admin user', async () => {
    const spies = mockProvisioningSteps(undefined);

    await expect(service.provision({
      tenantSlug: 'acme',
      companyName: 'Acme SRL',
      adminName: 'Ion Popescu',
      adminEmail: 'ion@acme.ro',
      plan: 'starter',
      maxUsers: 100,
      stripeCustomerId: 'cus_123',
      stripeSubscriptionId: 'sub_123',
      stripeCheckoutSessionId: 'cs_123',
    })).resolves.toEqual({ slug: 'acme', dbName: 'acme' });

    expect(spies.reserveTenantRegistry).toHaveBeenCalledWith(expect.objectContaining({
      slug: 'acme',
      dbName: 'acme',
      companyName: 'Acme SRL',
      adminEmail: 'ion@acme.ro',
      stripeSubscriptionId: 'sub_123',
    }), undefined);
    expect(spies.ensureDatabase).toHaveBeenCalledWith('acme');
    expect(spies.runTenantMigrations).toHaveBeenCalledWith('acme');
    expect(spies.seedAdminUser).toHaveBeenCalledWith('acme', 'ion@acme.ro', undefined, 'Ion Popescu');
    expect(spies.markTenantProvisioned).toHaveBeenCalled();
    expect(spies.markTenantProvisioningFailed).not.toHaveBeenCalled();
  });

  it('rejects an existing slug owned by another Stripe subscription', async () => {
    const spies = mockProvisioningSteps({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_existing',
      stripe_checkout_session_id: 'cs_existing',
      provisioning_status: 'provisioned',
    });

    await expect(service.provision({
      tenantSlug: 'acme',
      stripeSubscriptionId: 'sub_other',
      stripeCheckoutSessionId: 'cs_other',
    })).rejects.toBeInstanceOf(ConflictException);

    expect(spies.reserveTenantRegistry).not.toHaveBeenCalled();
    expect(spies.ensureDatabase).not.toHaveBeenCalled();
  });

  it('returns the existing tenant for an idempotent Stripe retry', async () => {
    const spies = mockProvisioningSteps({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });

    await expect(service.provision({
      tenantSlug: 'acme',
      stripeSubscriptionId: 'sub_123',
      stripeCheckoutSessionId: 'cs_123',
    })).resolves.toEqual({ slug: 'acme', dbName: 'acme' });

    expect(spies.reserveTenantRegistry).not.toHaveBeenCalled();
    expect(spies.ensureDatabase).not.toHaveBeenCalled();
  });

  it('marks invalid tenant slugs as unavailable without throwing', async () => {
    await expect(service.checkAvailability('Bad Slug')).resolves.toEqual({
      available: false,
      reason: 'invalid_slug',
    });
  });

  it('marks reserved tenant slugs as unavailable', async () => {
    await expect(service.checkAvailability('admin')).resolves.toEqual({
      available: false,
      reason: 'reserved_slug',
    });
  });

  it('marks existing tenant registry rows as unavailable', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });

    await expect(service.checkAvailability('acme')).resolves.toEqual({
      available: false,
      reason: 'tenant_exists',
    });
  });

  it('marks orphan databases as unavailable', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue(undefined);
    jest.spyOn(serviceAny, 'databaseExists').mockResolvedValue(true);

    await expect(service.checkAvailability('acme')).resolves.toEqual({
      available: false,
      reason: 'database_exists',
    });
  });

  it('marks clean tenant slugs as available', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue(undefined);
    jest.spyOn(serviceAny, 'databaseExists').mockResolvedValue(false);

    await expect(service.checkAvailability('acme')).resolves.toEqual({
      available: true,
    });
  });

  it('returns not_found for missing provisioning status', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue(undefined);

    await expect(service.getProvisioningStatus('acme')).resolves.toEqual({
      status: 'not_found',
    });
  });

  it('returns provisioning status without exposing raw errors', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: false,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'failed',
      provisioning_error: 'raw postgres error',
    });

    const result = await service.getProvisioningStatus('acme');

    expect(result).toEqual({ status: 'failed', tenantSlug: 'acme' });
    expect(result).not.toHaveProperty('provisioning_error');
  });

  it('returns the app URL only after provisioning succeeds', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });

    await expect(service.getProvisioningStatus('acme')).resolves.toEqual({
      status: 'provisioned',
      tenantSlug: 'acme',
      appUrl: 'https://acme.stanciulescu.xyz',
    });
  });

  function mockAdminCredentialTransaction(options: {
    profile?: any;
    user?: any;
    duplicateUser?: any;
    duplicateProfile?: any;
    userUpdateResult?: number;
  }) {
    const userUpdate = jest.fn().mockResolvedValue(options.userUpdateResult ?? 1);
    const profileUpdate = jest.fn().mockResolvedValue(1);
    const trx = jest.fn((table: string) => {
      if (table === 'profile') {
        return {
          whereRaw: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(options.profile),
            }),
            whereNot: jest.fn().mockReturnValue({
              first: jest.fn().mockResolvedValue(options.duplicateProfile),
            }),
          }),
          where: jest.fn().mockReturnValue({
            update: profileUpdate,
          }),
        };
      }

      return {
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(options.user),
          update: userUpdate,
        }),
        whereRaw: jest.fn().mockReturnValue({
          whereNot: jest.fn().mockReturnValue({
            first: jest.fn().mockResolvedValue(options.duplicateUser),
          }),
        }),
      };
    });
    const tenantDb = {
      transaction: jest.fn(async (callback) => callback(trx)),
      destroy: jest.fn().mockResolvedValue(undefined),
    };

    return { tenantDb, userUpdate, profileUpdate };
  }

  it('rejects admin credentials updates for the wrong Stripe session', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });
    const createTenantConnection = jest.spyOn(serviceAny, 'createTenantConnection');

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_other',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(createTenantConnection).not.toHaveBeenCalled();
  });

  it('rejects admin credentials updates for the wrong admin email', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'alt@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects admin credentials updates before provisioning completes', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: false,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioning',
    });

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects admin credentials updates when the admin profile is missing', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });
    const { tenantDb } = mockAdminCredentialTransaction({});
    jest.spyOn(serviceAny, 'createTenantConnection').mockReturnValue(tenantDb);

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantDb.destroy).toHaveBeenCalled();
  });

  it('rejects repeated admin credentials activation after the account is active', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });
    const { tenantDb } = mockAdminCredentialTransaction({
      profile: { id_user: 'user-1' },
      user: { id: 'user-1', must_change_password: false },
    });
    jest.spyOn(serviceAny, 'createTenantConnection').mockReturnValue(tenantDb);

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(tenantDb.destroy).toHaveBeenCalled();
  });

  it('rejects duplicate admin usernames', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });
    const { tenantDb } = mockAdminCredentialTransaction({
      profile: { id_user: 'user-1' },
      user: { id: 'user-1', must_change_password: true },
      duplicateUser: { id: 'user-2' },
    });
    jest.spyOn(serviceAny, 'createTenantConnection').mockReturnValue(tenantDb);

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ion@acme.ro',
      adminUsername: 'ion.popescu',
      password: 'secret123',
    })).rejects.toBeInstanceOf(ConflictException);
    expect(tenantDb.destroy).toHaveBeenCalled();
  });

  it('updates the tenant admin username, password and clears must_change_password', async () => {
    const serviceAny = service as any;
    jest.spyOn(serviceAny, 'findTenantRegistry').mockResolvedValue({
      slug: 'acme',
      db_name: 'acme',
      is_active: true,
      admin_email: 'ion@acme.ro',
      stripe_subscription_id: 'sub_123',
      stripe_checkout_session_id: 'cs_123',
      provisioning_status: 'provisioned',
    });
    const { tenantDb, userUpdate, profileUpdate } = mockAdminCredentialTransaction({
      profile: { id_user: 'user-1' },
      user: { id: 'user-1', must_change_password: true },
    });
    jest.spyOn(serviceAny, 'createTenantConnection').mockReturnValue(tenantDb);

    await expect(service.setAdminCredentials({
      slug: 'acme',
      stripeCheckoutSessionId: 'cs_123',
      adminEmail: 'ION@ACME.RO',
      adminUsername: 'Ion.Popescu',
      password: 'secret123',
    })).resolves.toEqual({ slug: 'acme' });

    expect(userUpdate).toHaveBeenCalledWith(expect.objectContaining({
      login_username: 'ion.popescu',
      hash: expect.any(String),
      must_change_password: false,
    }));
    expect(profileUpdate).toHaveBeenCalledWith({
      username: 'ion.popescu',
    });
    expect(tenantDb.destroy).toHaveBeenCalled();
  });
});
