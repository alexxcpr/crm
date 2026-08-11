import {
  down,
  up,
} from '../../migrations/tenant/20260811000001_normalize_relation_display_fields';

describe('relation display field tenant migration', () => {
  it('normalizeaza coloanele fizice la slug fara a atinge cazurile ambigue', async () => {
    const knex = { raw: jest.fn().mockResolvedValue(undefined) } as any;
    await up(knex);
    const sql = knex.raw.mock.calls[0][0] as string;
    expect(sql).toContain(
      'relation_display_field = display_field.slug',
    );
    expect(sql).toContain(
      'relation_display_field = display_field.column_name',
    );
    expect(sql).toContain('NOT EXISTS');
  });

  it('revine la coloana fizica pentru rollback', async () => {
    const knex = { raw: jest.fn().mockResolvedValue(undefined) } as any;
    await down(knex);
    const sql = knex.raw.mock.calls[0][0] as string;
    expect(sql).toContain(
      'relation_display_field = display_field.column_name',
    );
    expect(sql).toContain(
      'relation_display_field = display_field.slug',
    );
  });
});
