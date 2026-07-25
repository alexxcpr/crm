import { ActionService } from './action.service';
import { EntityEvent } from 'src/events/entity-event.enum';

function makeService(
  fields: Array<{
    slug: string;
    column_name: string;
  }>,
) {
  const where = jest
    .fn()
    .mockResolvedValue(fields);
  const select = jest
    .fn()
    .mockReturnValue({ where });
  const knex = jest
    .fn()
    .mockReturnValue({ select });

  const service = new ActionService(
    { knex } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  return { service, knex, select, where };
}

describe('ActionService workflow output normalization', () => {
  it('maps workflow field slugs to real column names before merging into CRUD data', async () => {
    const { service } = makeService([
      {
        slug: 'search_name',
        column_name: 'cf_search_name',
      },
      { slug: 'nume', column_name: 'nume' },
    ]);

    const result = await (
      service as any
    ).normalizeWorkflowOutput('entity-id', {
      search_name: 'Ana - Acme',
      cf_search_name: 'Ana - Acme',
      unknown_key: 'ignored',
      nume: 'Ana',
    });

    expect(result).toEqual({
      cf_search_name: 'Ana - Acme',
      nume: 'Ana',
    });
  });

  it('builds before-update workflow input from previous data plus update patch', () => {
    const { service } = makeService([]);

    const result = (
      service as any
    ).buildWorkflowInput(
      { slug: 'actualizeaza_search_name' },
      {
        entitySlug: 'crm_contact',
        entityId: 'entity-id',
        recordId: 'record-id',
        data: { cf_search_name: 'nou' },
        previousData: {
          id: 'record-id',
          cf_nume: 'Ana',
          cf_search_name: 'vechi',
        },
        userId: 'user-id',
        profileId: 'profile-id',
      },
    );

    expect(result.record).toEqual({
      id: 'record-id',
      cf_nume: 'Ana',
      cf_search_name: 'nou',
    });
    expect(
      result.previousData.cf_search_name,
    ).toBe('vechi');
  });
});

describe('ActionService auto triggers', () => {
  function autoTriggerService(runtime: {
    execute: jest.Mock;
  }) {
    const actionQuery: any = {
      where: jest.fn(() => actionQuery),
      andWhere: jest.fn().mockResolvedValue([
        {
          id_action: 'action',
          id_workflow: 'workflow',
          slug: 'auto',
          name: 'Automat',
          trigger_events: [
            'entity.before_insert',
            'entity.after_insert',
          ],
          trigger_conditions: [],
        },
      ]),
    };
    const fieldQuery: any = {
      select: jest.fn(() => fieldQuery),
      where: jest
        .fn()
        .mockResolvedValue([
          {
            slug: 'total',
            column_name: 'cf_total',
          },
        ]),
    };
    const knex = jest.fn((table: string) =>
      table === 'action_definition'
        ? actionQuery
        : fieldQuery,
    );
    return new ActionService(
      { knex, isAvailable: true } as any,
      runtime as any,
      {} as any,
      {} as any,
    );
  }

  function payload() {
    return {
      entitySlug: 'orders',
      entityId: 'entity',
      recordId: null,
      data: { cf_name: 'Comanda' },
      actor: { id: 'user', profileId: 'profile' },
    } as any;
  }

  it('aplica output-ul before asupra DTO-ului CRUD', async () => {
    const runtime = {
      execute: jest.fn().mockResolvedValue({
        executionId: 'execution',
        status: 'completed',
        output: { total: 125 },
      }),
    };
    const service = autoTriggerService(runtime);
    const eventPayload = payload();

    await (service as any).evaluateAutoTriggers(
      EntityEvent.BeforeInsert,
      eventPayload,
    );

    expect(eventPayload.data.cf_total).toBe(125);
  });

  it('nu transforma esecul after intr-un esec CRUD', async () => {
    const runtime = {
      execute: jest
        .fn()
        .mockRejectedValue(
          new Error('esec extern'),
        ),
    };
    const service = autoTriggerService(runtime);

    await expect(
      (service as any).evaluateAutoTriggers(
        EntityEvent.AfterInsert,
        payload(),
      ),
    ).resolves.toBeUndefined();
  });

  it('propaga esecul before si pastreaza executionId', async () => {
    const error = Object.assign(
      new Error('validare esuata'),
      {
        executionId: 'execution-failed',
      },
    );
    const runtime = {
      execute: jest.fn().mockRejectedValue(error),
    };
    const service = autoTriggerService(runtime);

    await expect(
      (service as any).evaluateAutoTriggers(
        EntityEvent.BeforeInsert,
        payload(),
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        executionId: 'execution-failed',
        status: 'failed',
      }),
    });
  });
});
