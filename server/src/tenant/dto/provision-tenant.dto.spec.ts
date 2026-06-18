import { validate } from 'class-validator';
import { ProvisionTenantDto, SetAdminCredentialsDto } from './provision-tenant.dto';

describe('ProvisionTenantDto', () => {
  it('rejects an invalid provisioning payload', async () => {
    const dto = Object.assign(new ProvisionTenantDto(), {
      tenantSlug: 'Bad Slug',
      companyName: 'A',
      adminName: 'I',
      adminEmail: 'not-an-email',
      maxUsers: 0,
      stripeCustomerId: '',
      stripeSubscriptionId: '',
      stripeCheckoutSessionId: '',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining([
      'tenantSlug',
      'companyName',
      'adminName',
      'adminEmail',
      'maxUsers',
      'stripeCustomerId',
      'stripeSubscriptionId',
      'stripeCheckoutSessionId',
    ]));
  });

  it('rejects an invalid admin credentials payload', async () => {
    const dto = Object.assign(new SetAdminCredentialsDto(), {
      stripeCheckoutSessionId: '',
      adminEmail: 'not-an-email',
      adminUsername: 'Bad User',
      password: 'short',
    });

    const errors = await validate(dto);
    const properties = errors.map((error) => error.property);

    expect(properties).toEqual(expect.arrayContaining([
      'stripeCheckoutSessionId',
      'adminEmail',
      'adminUsername',
      'password',
    ]));
  });
});
