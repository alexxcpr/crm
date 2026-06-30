import { ActionService } from './action.service';

function makeService(fields: Array<{ slug: string; column_name: string }>) {
  const where = jest.fn().mockResolvedValue(fields);
  const select = jest.fn().mockReturnValue({ where });
  const knex = jest.fn().mockReturnValue({ select });

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
      { slug: 'search_name', column_name: 'cf_search_name' },
      { slug: 'nume', column_name: 'nume' },
    ]);

    const result = await (service as any).normalizeWorkflowOutput('entity-id', {
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
});
