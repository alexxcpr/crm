import { N8nWebhookController } from './n8n-webhook.controller';
import { TenantContext } from 'src/tenant/tenant-context.service';

function makeController() {
  const dataService = {
    findAll: jest.fn(),
  };

  const controller = new N8nWebhookController(
    { get: jest.fn((_key: string, fallback: string) => fallback) } as any,
    {} as any,
    {} as any,
    dataService as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  jest
    .spyOn(controller as any, 'handleDataOperation')
    .mockImplementation((_tenantSlug: string, _workflowToken: string, callback: any) =>
      callback({
        id: 'user-id',
        profile: {
          id_profile: 'profile-id',
          id_user: 'user-id',
          username: 'profil.demo',
          email: 'profil@example.com',
          display_name: 'Profil Demo',
          is_default: true,
          is_active: true,
        },
      }),
    );

  return { controller, dataService };
}

function makeAuthenticatedController(options: {
  tokenTenant?: string;
  tokenValid?: boolean;
  profileActive?: boolean;
} = {}) {
  const tenantContext = new TenantContext();
  const rolesQuery = {
    join: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue([]),
  };
  const knex = jest.fn((table: string) => {
    if (table === 'user') {
      return {
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue({
            id: 'user-id',
            login_username: 'demo',
            is_active: true,
            hash: 'secret',
          }),
        }),
      };
    }
    if (table === 'profile') {
      return {
        where: jest.fn().mockReturnValue({
          first: jest.fn().mockResolvedValue(options.profileActive === false ? undefined : {
            id_profile: 'profile-id',
            id_user: 'user-id',
            username: 'profil.demo',
            email: 'profil@example.com',
            display_name: 'Profil Demo',
            is_default: true,
            is_active: true,
          }),
        }),
      };
    }
    if (table === 'profile_role') return rolesQuery;
    throw new Error(`Tabela neasteptata in test: ${table}`);
  });
  const jwt = {
    verifyAsync: options.tokenValid === false
      ? jest.fn().mockRejectedValue(new Error('invalid'))
      : jest.fn().mockResolvedValue({
          sub: 'user-id',
          profileId: 'profile-id',
          tenant: options.tokenTenant ?? 'tenant',
          purpose: 'workflow',
        }),
  };

  return new N8nWebhookController(
    { get: jest.fn((_key: string, fallback: string) => fallback) } as any,
    {} as any,
    { getConnection: jest.fn().mockReturnValue(knex) } as any,
    {} as any,
    tenantContext,
    {
      getCompanyBySlug: jest.fn().mockResolvedValue({
        isActive: true,
        dbName: 'tenant_db',
      }),
    } as any,
    jwt as any,
    {} as any,
  );
}

describe('N8nWebhookController current-profile', () => {
  it('returneaza doar campurile publice ale profilului initiator', async () => {
    const { controller } = makeController();

    const result = await controller.getCurrentProfile(
      'tenant',
      undefined,
      'workflow-token',
    );

    expect(result).toEqual({
      data: {
        id_profile: 'profile-id',
        id_user: 'user-id',
        username: 'profil.demo',
        email: 'profil@example.com',
        display_name: 'Profil Demo',
      },
    });
  });

  it('refuza executia fara workflow token', async () => {
    const controller = new N8nWebhookController(
      { get: jest.fn((_key: string, fallback: string) => fallback) } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      controller.getCurrentProfile('tenant', undefined, undefined),
    ).rejects.toThrow('Missing workflow token');
  });

  it('refuza un workflow token invalid', async () => {
    const controller = makeAuthenticatedController({ tokenValid: false });

    await expect(
      controller.getCurrentProfile('tenant', undefined, 'invalid-token'),
    ).rejects.toThrow('Workflow token invalid sau expirat');
  });

  it('refuza tokenul emis pentru alt tenant', async () => {
    const controller = makeAuthenticatedController({ tokenTenant: 'alt-tenant' });

    await expect(
      controller.getCurrentProfile('tenant', undefined, 'workflow-token'),
    ).rejects.toThrow('Workflow token invalid');
  });

  it('refuza profilul care nu mai este activ', async () => {
    const controller = makeAuthenticatedController({ profileActive: false });

    await expect(
      controller.getCurrentProfile('tenant', undefined, 'workflow-token'),
    ).rejects.toThrow('Profilul workflow nu mai este activ');
  });
});

describe('N8nWebhookController data-list', () => {
  it('returneaza null pentru lookup limit=1 cand filtrul are valoare goala', async () => {
    const { controller, dataService } = makeController();

    const result = await controller.getDataList(
      'tenant',
      {
        entity: 'crm_contact',
        limit: '1',
        filter: {
          id: {
            eq: '',
          },
        },
      },
      undefined,
      'workflow-token',
    );

    expect(result).toEqual({ data: null });
    expect(dataService.findAll).not.toHaveBeenCalled();
  });

  it('returneaza null pentru lookup limit=1 cand filtrul are sentinel de valoare lipsa', async () => {
    const { controller, dataService } = makeController();

    const result = await controller.getDataList(
      'tenant',
      {
        entity: 'crm_companie',
        limit: '1',
        filter: {
          id: {
            eq: '__MODUVIS_EMPTY_FILTER__',
          },
        },
      },
      undefined,
      'workflow-token',
    );

    expect(result).toEqual({ data: null });
    expect(dataService.findAll).not.toHaveBeenCalled();
  });

  it('pastreaza lookup-ul valid si intoarce primul rezultat pentru limit=1', async () => {
    const { controller, dataService } = makeController();
    dataService.findAll.mockResolvedValue({
      data: [{ id: 'contact-id' }],
      meta: { total: 1 },
    });

    const result = await controller.getDataList(
      'tenant',
      {
        entity: 'crm_contact',
        limit: '1',
        filter: {
          id: {
            eq: 'contact-id',
          },
        },
      },
      undefined,
      'workflow-token',
    );

    expect(result).toEqual({ data: { id: 'contact-id' } });
    expect(dataService.findAll).toHaveBeenCalledWith(
      'crm_contact',
      expect.objectContaining({ entity: 'crm_contact' }),
      expect.objectContaining({ id: 'user-id' }),
      { tableOnly: false },
    );
  });
});
