import { WorkflowSchedulerWorker } from './workflow-scheduler.worker';

function tenantQuery(tenants: any[]) {
  const query: any = {
    where: jest.fn(() => query),
    select: jest.fn().mockResolvedValue(tenants),
  };
  return jest.fn(() => query);
}

describe('WorkflowSchedulerWorker', () => {
  it('limiteaza executiile concurente la cinci', async () => {
    const claims = Array.from(
      { length: 12 },
      (_, index) => ({
        schedule: {
          id_schedule: `schedule-${index}`,
        },
      }),
    );
    let claimIndex = 0;
    let active = 0;
    let maximum = 0;
    const schedules = {
      claimNextDue: jest.fn(
        async () => claims[claimIndex++] ?? null,
      ),
      executeClaim: jest.fn(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) =>
          setTimeout(resolve, 2),
        );
        active -= 1;
      }),
    };
    const worker = new WorkflowSchedulerWorker(
      {
        knex: tenantQuery([
          { slug: 'demo', db_name: 'demo' },
        ]),
      } as any,
      {
        getConnection: jest.fn(() => ({})),
      } as any,
      {
        run: jest.fn((_store, callback) =>
          callback(),
        ),
      } as any,
      schedules as any,
    );

    await worker.tick();

    expect(
      schedules.executeClaim,
    ).toHaveBeenCalledTimes(12);
    expect(maximum).toBeLessThanOrEqual(5);
  });

  it('ignora tenant-urile fara scadente', async () => {
    const schedules = {
      claimNextDue: jest
        .fn()
        .mockResolvedValue(null),
      executeClaim: jest.fn(),
    };
    const worker = new WorkflowSchedulerWorker(
      {
        knex: tenantQuery([
          { slug: 'demo', db_name: 'demo' },
        ]),
      } as any,
      {
        getConnection: jest.fn(() => ({})),
      } as any,
      {
        run: jest.fn((_store, callback) =>
          callback(),
        ),
      } as any,
      schedules as any,
    );

    await worker.tick();

    expect(
      schedules.executeClaim,
    ).not.toHaveBeenCalled();
  });
});
