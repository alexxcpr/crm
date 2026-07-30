import { WorkflowNodeExecutorService } from './workflow-node-executor.service';

describe('Workflow start node scheduled context', () => {
  it('expune metadatele programarii fara record implicit', async () => {
    const executor =
      new WorkflowNodeExecutorService(
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
      );

    const output = await executor.execute({
      context: {
        trigger: 'schedule',
        schedule: {
          id: 'schedule-id',
          name: 'Raport zilnic',
          scheduledFor:
            '2026-07-30T09:00:00.000Z',
          timezone: 'Europe/Bucharest',
        },
        actor: {} as any,
      } as any,
      node: {
        id: 'start',
        type: 'start',
        config: {},
      } as any,
      token: {
        current: {},
        itemIndex: 0,
      } as any,
      runIndex: 0,
    });

    expect(output).toEqual(
      expect.objectContaining({
        record: null,
        recordId: null,
        scheduledAt: '2026-07-30T09:00:00.000Z',
        schedule: expect.objectContaining({
          id: 'schedule-id',
          timezone: 'Europe/Bucharest',
        }),
      }),
    );
  });
});
