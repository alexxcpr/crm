import { WorkflowHistoryService } from './workflow-history.service';

describe('WorkflowHistoryService scheduled executions', () => {
  function setup() {
    const inserted: any[] = [];
    const query: any = {
      insert: jest.fn(async (value) => {
        inserted.push(value);
      }),
    };
    const knex = jest.fn(() => query);
    return {
      service: new WorkflowHistoryService(
        { knex } as any,
        {} as any,
      ),
      inserted,
    };
  }

  const input = {
    trigger: 'schedule' as const,
    triggerName: 'Raport zilnic',
    schedule: {
      id: 'schedule-id',
      name: 'Raport zilnic',
      scheduledFor: '2026-07-30T09:00:00.000Z',
      timezone: 'Europe/Bucharest',
    },
    actor: {
      id: 'scheduler-user',
      profileId: 'scheduler-profile',
    } as any,
  };

  it('salveaza legatura cu programarea', async () => {
    const { service, inserted } = setup();
    await service.startExecution(
      'workflow',
      'revision',
      input,
    );
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        id_schedule: 'schedule-id',
        scheduled_for: '2026-07-30T09:00:00.000Z',
        trigger_type: 'schedule',
      }),
    );
  });

  it('salveaza scadentele omise', async () => {
    const { service, inserted } = setup();
    await service.skipExecution(
      'workflow',
      'revision',
      input,
      'schedule_overlap',
      'Executie activa',
    );
    expect(inserted[0]).toEqual(
      expect.objectContaining({
        status: 'skipped',
        error_code: 'schedule_overlap',
        duration_ms: 0,
      }),
    );
  });
});
