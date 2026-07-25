import { WorkflowService } from './workflow.service';

function serviceForCompilation(valid: boolean) {
  const existing = {
    id_workflow: 'workflow',
    name: 'Test',
    slug: 'test',
    status: 'active',
    version: 1,
    latest_revision_id: 'revision-1',
    active_revision_id: 'revision-1',
  };
  const latest = {
    id_revision: 'revision-1',
    version: 1,
    source_nodes: [],
    source_connections: [],
  };
  const workflowUpdates: Record<string, any>[] =
    [];
  const revisionInserts: Record<string, any>[] =
    [];

  const trx: any = jest.fn((table: string) => {
    if (table === 'workflow_definition') {
      const query: any = {
        where: jest.fn(() => query),
        forUpdate: jest.fn(() => query),
        first: jest
          .fn()
          .mockResolvedValue(existing),
        update: jest.fn((patch) => {
          workflowUpdates.push(patch);
          return query;
        }),
        returning: jest.fn(async () => [
          {
            ...existing,
            ...workflowUpdates.at(-1),
          },
        ]),
      };
      return query;
    }
    const query: any = {
      where: jest.fn(() => query),
      max: jest.fn(() => query),
      first: jest
        .fn()
        .mockResolvedValue({ max_version: 1 }),
      insert: jest.fn((row) => {
        revisionInserts.push(row);
        return query;
      }),
      returning: jest.fn(async () => [
        {
          id_revision: 'revision-2',
          version: 2,
          compiled_ir: valid
            ? { irVersion: 1 }
            : null,
          is_valid: valid,
          validation_errors: valid
            ? []
            : [{ code: 'invalid' }],
        },
      ]),
    };
    return query;
  });

  const knex: any = jest.fn((table: string) => {
    const query: any = {
      where: jest.fn(() => query),
      first: jest
        .fn()
        .mockResolvedValue(
          table === 'workflow_definition'
            ? existing
            : latest,
        ),
    };
    return query;
  });
  knex.transaction = jest.fn(async (callback) =>
    callback(trx),
  );

  const compiler = {
    compile: jest.fn().mockResolvedValue({
      valid,
      ir: valid ? { irVersion: 1 } : null,
      errors: valid ? [] : [{ code: 'invalid' }],
      warnings: [],
    }),
  };

  return {
    service: new WorkflowService(
      { knex } as any,
      compiler as any,
    ),
    workflowUpdates,
    revisionInserts,
  };
}

describe('WorkflowService revisions', () => {
  it('publica atomic revizia valida salvata pentru un workflow activ', async () => {
    const {
      service,
      workflowUpdates,
      revisionInserts,
    } = serviceForCompilation(true);

    const result = await service.update(
      'workflow',
      {
        nodes: [
          {
            id: 'start',
            type: 'start',
            parameters: {},
          },
        ],
        connections: [],
      },
      'profile',
    );

    expect(revisionInserts[0]).toEqual(
      expect.objectContaining({
        version: 2,
        is_valid: true,
        id_created_by_profile: 'profile',
      }),
    );
    expect(
      workflowUpdates[0].active_revision_id,
    ).toBe('revision-2');
    expect(result.data.published).toBe(true);
  });

  it('pastreaza revizia activa anterioara cand salvarea este invalida', async () => {
    const { service, workflowUpdates } =
      serviceForCompilation(false);

    const result = await service.update(
      'workflow',
      {
        nodes: [
          {
            id: 'broken',
            type: 'delay',
            parameters: {},
          },
        ],
        connections: [],
      },
    );

    expect(
      workflowUpdates[0].latest_revision_id,
    ).toBe('revision-2');
    expect(workflowUpdates[0]).not.toHaveProperty(
      'active_revision_id',
    );
    expect(result.data.active_revision_id).toBe(
      'revision-1',
    );
    expect(result.data.isValid).toBe(false);
    expect(result.data.published).toBe(false);
  });
});
