import { N8nWebhookController } from './n8n-webhook.controller';

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
  );

  jest
    .spyOn(controller as any, 'handleDataOperation')
    .mockImplementation((_tenantSlug: string, _workflowToken: string, callback: any) =>
      callback({ id: 'user-id' }),
    );

  return { controller, dataService };
}

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
      { id: 'user-id' },
      { tableOnly: false },
    );
  });
});
