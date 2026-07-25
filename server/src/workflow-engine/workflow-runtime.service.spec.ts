import { WorkflowRuntimeService } from './workflow-runtime.service';

function runtime(execute: jest.Mock) {
  const history = {
    startNodeRun: jest
      .fn()
      .mockResolvedValue('run'),
    completeNodeRun: jest
      .fn()
      .mockResolvedValue(undefined),
    failNodeRun: jest
      .fn()
      .mockResolvedValue(undefined),
  };
  const service = new WorkflowRuntimeService(
    {} as any,
    history as any,
    { execute } as any,
    {} as any,
  );
  return { service, history };
}

function context() {
  return {
    executionId: 'execution',
    workflowId: 'workflow',
    revisionId: 'revision',
    trigger: 'manual',
    actor: {},
    deadlineAt: Date.now() + 60_000,
    signal: new AbortController().signal,
    nodeRunCount: 0,
    outputs: new Map(),
    record: {},
  };
}

describe('WorkflowRuntimeService IR', () => {
  it('executa iesirile multiple secvential in ordinea salvata', async () => {
    const order: string[] = [];
    const { service } = runtime(
      jest.fn(async ({ node }) => {
        order.push(node.id);
        return { node: node.id };
      }),
    );
    await (service as any).runIr(
      {
        irVersion: 1,
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            type: 'start',
            version: 1,
            config: {},
          },
          {
            id: 'first',
            type: 'set_data',
            version: 1,
            config: {},
          },
          {
            id: 'second',
            type: 'set_data',
            version: 1,
            config: {},
          },
        ],
        edges: [
          {
            source: 'start',
            target: 'first',
            order: 0,
          },
          {
            source: 'start',
            target: 'second',
            order: 1,
          },
        ],
        dependencies: {},
      },
      context(),
    );
    expect(order).toEqual([
      'start',
      'first',
      'second',
    ]);
  });

  it('urmeaza numai ramura conditiei selectate', async () => {
    const order: string[] = [];
    const inputs: Record<string, any> = {};
    const { service } = runtime(
      jest.fn(async ({ node, token }) => {
        order.push(node.id);
        inputs[node.id] = token.current;
        return node.type === 'condition'
          ? {
              matched: true,
              value: token.current,
            }
          : node.type === 'start'
            ? { customer: 'Ana' }
            : {};
      }),
    );
    await (service as any).runIr(
      {
        irVersion: 1,
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            type: 'start',
            version: 1,
            config: {},
          },
          {
            id: 'if',
            type: 'condition',
            version: 1,
            config: {},
          },
          {
            id: 'yes',
            type: 'set_data',
            version: 1,
            config: {},
          },
          {
            id: 'no',
            type: 'set_data',
            version: 1,
            config: {},
          },
        ],
        edges: [
          {
            source: 'start',
            target: 'if',
            order: 0,
          },
          {
            source: 'if',
            target: 'yes',
            sourceHandle: 'true',
            order: 1,
          },
          {
            source: 'if',
            target: 'no',
            sourceHandle: 'false',
            order: 2,
          },
        ],
        dependencies: {},
      },
      context(),
    );
    expect(order).toEqual(['start', 'if', 'yes']);
    expect(inputs.yes).toEqual({
      customer: 'Ana',
    });
  });

  it('nu face retry dupa eroare si pastreaza nodurile deja finalizate', async () => {
    const execute = jest
      .fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ saved: true })
      .mockRejectedValueOnce(new Error('stop'));
    const { service, history } = runtime(execute);
    await expect(
      (service as any).runIr(
        {
          irVersion: 1,
          startNodeId: 'start',
          nodes: [
            {
              id: 'start',
              type: 'start',
              version: 1,
              config: {},
            },
            {
              id: 'write',
              type: 'set_data',
              version: 1,
              config: {},
            },
            {
              id: 'fail',
              type: 'stop_error',
              version: 1,
              config: {},
            },
          ],
          edges: [
            {
              source: 'start',
              target: 'write',
              order: 0,
            },
            {
              source: 'write',
              target: 'fail',
              order: 1,
            },
          ],
          dependencies: {},
        },
        context(),
      ),
    ).rejects.toThrow('stop');
    expect(execute).toHaveBeenCalledTimes(3);
    expect(
      history.completeNodeRun,
    ).toHaveBeenCalledTimes(2);
    expect(
      history.failNodeRun,
    ).toHaveBeenCalledTimes(1);
  });

  it('opreste foreach peste 500 de elemente', async () => {
    const { service } = runtime(
      jest.fn(async ({ node }) =>
        node.type === 'for_each'
          ? Array.from(
              { length: 501 },
              (_, index) => ({ index }),
            )
          : {},
      ),
    );
    await expect(
      (service as any).runIr(
        {
          irVersion: 1,
          startNodeId: 'start',
          nodes: [
            {
              id: 'start',
              type: 'start',
              version: 1,
              config: {},
            },
            {
              id: 'loop',
              type: 'for_each',
              version: 1,
              config: {},
            },
          ],
          edges: [
            {
              source: 'start',
              target: 'loop',
              order: 0,
            },
          ],
          dependencies: {},
        },
        context(),
      ),
    ).rejects.toThrow('maximum 500');
  });

  it('expune separat elementul curent al fiecarui foreach', async () => {
    const currentItems: any[] = [];
    const { service } = runtime(
      jest.fn(async ({ node, token }) => {
        if (node.type === 'for_each') {
          return [{ id: 'a' }, { id: 'b' }];
        }
        if (node.id === 'consume') {
          currentItems.push(token.current);
        }
        return token.current;
      }),
    );
    const executionContext = context();

    await (service as any).runIr(
      {
        irVersion: 1,
        startNodeId: 'start',
        nodes: [
          {
            id: 'start',
            type: 'start',
            version: 1,
            config: {},
          },
          {
            id: 'loop',
            type: 'for_each',
            version: 1,
            config: {},
          },
          {
            id: 'consume',
            type: 'set_data',
            version: 1,
            config: {},
          },
        ],
        edges: [
          {
            source: 'start',
            target: 'loop',
            order: 0,
          },
          {
            source: 'loop',
            target: 'consume',
            order: 1,
          },
        ],
        dependencies: {},
      },
      executionContext,
    );

    expect(currentItems).toEqual([
      { id: 'a' },
      { id: 'b' },
    ]);
    expect(
      executionContext.outputs
        .get('loop')
        .filter(
          (output: any) =>
            !Array.isArray(output.value),
        )
        .map((output: any) => output.value),
    ).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('nu porneste noduri dupa deadline', async () => {
    const execute = jest.fn();
    const { service } = runtime(execute);
    await expect(
      (service as any).runIr(
        {
          irVersion: 1,
          startNodeId: 'start',
          nodes: [
            {
              id: 'start',
              type: 'start',
              version: 1,
              config: {},
            },
          ],
          edges: [],
          dependencies: {},
        },
        {
          ...context(),
          deadlineAt: Date.now() - 1,
        },
      ),
    ).rejects.toThrow('60 de secunde');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('WorkflowRuntimeService execute', () => {
  it('porneste doua executii independente pentru doua cereri simultane', async () => {
    const knex = jest.fn((table: string) => {
      const query: any = {
        where: jest.fn(() => query),
        first: jest.fn().mockResolvedValue(
          table === 'workflow_definition'
            ? {
                id_workflow: 'workflow',
                status: 'active',
                active_revision_id: 'revision',
              }
            : {
                id_revision: 'revision',
                is_valid: true,
                compiled_ir: {
                  irVersion: 1,
                  startNodeId: 'start',
                  nodes: [
                    {
                      id: 'start',
                      type: 'start',
                      version: 1,
                      config: {},
                    },
                  ],
                  edges: [],
                  dependencies: {
                    entityIds: [],
                    fieldIds: [],
                    integrationIds: [],
                    httpDomains: [],
                  },
                },
              },
        ),
      };
      return query;
    });
    const history = {
      startExecution: jest
        .fn()
        .mockResolvedValueOnce('execution-1')
        .mockResolvedValueOnce('execution-2'),
      completeExecution: jest.fn(),
      failExecution: jest.fn(),
      startNodeRun: jest
        .fn()
        .mockResolvedValueOnce('run-1')
        .mockResolvedValueOnce('run-2'),
      completeNodeRun: jest.fn(),
      failNodeRun: jest.fn(),
    };
    const service = new WorkflowRuntimeService(
      { knex } as any,
      history as any,
      {
        execute: jest.fn(
          ({ token }) => token.current,
        ),
      } as any,
      {
        current: undefined,
        run: jest.fn((_store, callback) =>
          callback(),
        ),
      } as any,
    );
    const actor = {
      id: 'user',
      profileId: 'profile',
    } as any;

    const results = await Promise.all([
      service.execute('workflow', {
        trigger: 'manual',
        record: { id: 'record' },
        actor,
      }),
      service.execute('workflow', {
        trigger: 'manual',
        record: { id: 'record' },
        actor,
      }),
    ]);

    expect(
      results.map((result) => result.executionId),
    ).toEqual(['execution-1', 'execution-2']);
    expect(
      history.startExecution,
    ).toHaveBeenCalledTimes(2);
  });
});
