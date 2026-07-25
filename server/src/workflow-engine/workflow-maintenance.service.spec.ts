import { WorkflowMaintenanceService } from './workflow-maintenance.service';

describe('WorkflowMaintenanceService', () => {
  it('sterge numai istoricul mai vechi de 30 de zile din fiecare tenant', async () => {
    const del = jest.fn().mockResolvedValue(3);
    const where = jest
      .fn()
      .mockReturnValue({ del });
    const tenantDb: any = jest.fn(() => ({
      where,
    }));
    tenantDb.schema = {
      hasTable: jest.fn().mockResolvedValue(true),
    };
    const tenantsQuery = {
      where: jest.fn().mockReturnThis(),
      select: jest
        .fn()
        .mockResolvedValue([
          { slug: 'acme', db_name: 'acme' },
        ]),
    };
    const metaKnex: any = jest.fn(
      () => tenantsQuery,
    );
    metaKnex.transaction = jest.fn(
      async (callback) =>
        callback({
          raw: jest
            .fn()
            .mockResolvedValue({
              rows: [{ locked: true }],
            }),
        }),
    );
    const service =
      new WorkflowMaintenanceService(
        { knex: metaKnex } as any,
        {
          getConnection: jest
            .fn()
            .mockReturnValue(tenantDb),
        } as any,
      );
    const before =
      Date.now() - 30 * 24 * 60 * 60 * 1000;

    await service.cleanupHistory();
    const after =
      Date.now() - 30 * 24 * 60 * 60 * 1000;

    expect(tenantDb).toHaveBeenCalledWith(
      'workflow_execution',
    );
    expect(where).toHaveBeenCalledWith(
      'date_started',
      '<',
      expect.any(Date),
    );
    const cutoff = where.mock.calls[0][2] as Date;
    expect(
      cutoff.getTime(),
    ).toBeGreaterThanOrEqual(before);
    expect(cutoff.getTime()).toBeLessThanOrEqual(
      after,
    );
    expect(del).toHaveBeenCalledTimes(1);
  });
});
