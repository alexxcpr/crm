import { up } from '../../migrations/tenant/20260730000001_workflow_scheduler';

describe('workflow scheduler tenant migration', () => {
  it('pastreaza emailul tehnic numai pe profile, conform schemei multi-profile', async () => {
    const inserts: Record<string, any[]> = {};
    const chain: any = {};
    for (const method of [
      'uuid',
      'primary',
      'defaultTo',
      'boolean',
      'notNullable',
      'string',
      'references',
      'inTable',
      'onDelete',
      'timestamp',
      'nullable',
      'index',
      'dropIndex',
      'dropColumn',
    ]) {
      chain[method] = jest.fn(() => chain);
    }

    const trx: any = (tableName: string) => {
      const query: any = {};
      query.insert = jest.fn((value: any) => {
        (inserts[tableName] ??= []).push(value);
        return query;
      });
      query.onConflict = jest.fn(() => query);
      query.ignore = jest.fn(() => query);
      query.returning = jest.fn(async () =>
        tableName === 'user'
          ? [{ id: 'scheduler-user' }]
          : [],
      );
      query.where = jest.fn(() => query);
      query.first = jest.fn(async () =>
        tableName === 'profile'
          ? { id_profile: 'scheduler-profile' }
          : null,
      );
      return query;
    };
    trx.transaction = jest.fn(
      async (callback: (db: any) => unknown) =>
        callback(trx),
    );
    trx.schema = {
      alterTable: jest.fn(
        async (
          _table: string,
          callback: (table: any) => void,
        ) => callback(chain),
      ),
      createTable: jest.fn(
        async (
          _table: string,
          callback: (table: any) => void,
        ) => callback(chain),
      ),
    };
    trx.fn = {
      uuid: jest.fn(() => 'uuid()'),
      now: jest.fn(() => 'now()'),
    };
    trx.raw = jest.fn().mockResolvedValue(undefined);

    await up(trx);

    expect(inserts.user[0]).toEqual(
      expect.objectContaining({
        login_username: 'scheduler',
        is_system: true,
      }),
    );
    expect(inserts.user[0]).not.toHaveProperty(
      'email',
    );
    expect(inserts.profile[0]).toEqual(
      expect.objectContaining({
        username: 'scheduler',
        email: 'scheduler@moduvis.system',
        access_level: 'tenant_admin',
        is_system: true,
      }),
    );
  });
});
