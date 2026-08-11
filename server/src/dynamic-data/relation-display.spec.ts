import { DynamicDataService } from './dynamic-data.service';

function service(overrides: {
  knex?: any;
  authorization?: any;
  recordAccess?: any;
  resolver?: any;
} = {}) {
  return new DynamicDataService(
    { knex: overrides.knex ?? jest.fn() } as any,
    {} as any,
    {} as any,
    {} as any,
    overrides.authorization ?? ({} as any),
    overrides.recordAccess ?? ({} as any),
    {} as any,
    overrides.resolver ?? ({} as any),
  );
}

describe('DynamicDataService relation display', () => {
  it('construieste JOIN-ul cu coloana fizica rezolvata', () => {
    const dataService = service();
    const query = {
      leftJoin: jest.fn().mockReturnThis(),
    };
    const selectColumns: any[] = [];
    (dataService as any).addRelationJoins(
      query,
      'ent_orders',
      [
        {
          ui_type: 'relation',
          column_name: 'cf_customer',
          relation_display_field: 'name',
          relation_display_column: 'cf_name',
          relation_entity: {
            table_name: 'ent_customers',
          },
        },
      ],
      selectColumns,
    );

    expect(selectColumns).toContain(
      'rel_cf_customer.cf_name as cf_customer_display',
    );
    expect(selectColumns.join(' ')).not.toContain(
      'rel_cf_customer.name ',
    );
  });

  it('cauta optiuni numai cu identificatorul rezolvat din metadata', async () => {
    const dataQuery: any = {
      select: jest.fn().mockReturnThis(),
      whereRaw: jest.fn().mockReturnThis(),
      whereIn: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      then: (resolve: (rows: any[]) => unknown) =>
        Promise.resolve(
          resolve([
            { value: 'record-id', label: 'Contract 1' },
          ]),
        ),
    };
    const knex = jest.fn(() => dataQuery);
    const recordAccess = {
      require: jest.fn().mockResolvedValue({ scope: 'all' }),
      applyScope: jest.fn(),
    };
    const resolver = {
      resolveForTarget: jest.fn().mockResolvedValue({
        slug: 'contract_number',
        column_name: 'cf_contract_number',
      }),
    };
    const dataService = service({
      knex,
      authorization: {
        getEntity: jest.fn().mockResolvedValue({
          id_entity: 'entity-id',
          table_name: 'ent_contracts',
        }),
      },
      recordAccess,
      resolver,
    });

    const result = await dataService.findRelationOptions(
      'contracts',
      {
        displayField: 'contract_number',
        search: 'CTR',
      },
      { profileId: 'profile-id' } as any,
    );

    expect(resolver.resolveForTarget).toHaveBeenCalledWith(
      'entity-id',
      'contract_number',
    );
    expect(dataQuery.whereRaw).toHaveBeenCalledWith(
      'CAST(?? AS TEXT) ILIKE ?',
      ['ent_contracts.cf_contract_number', '%CTR%'],
    );
    expect(result).toEqual({
      data: [{ value: 'record-id', label: 'Contract 1' }],
    });
  });

  it('respinge displayField invalid inainte de rezolvarea metadata', async () => {
    const resolver = {
      resolveForTarget: jest.fn(),
    };
    const dataService = service({
      authorization: {
        getEntity: jest.fn().mockResolvedValue({
          id_entity: 'entity-id',
          table_name: 'ent_contracts',
        }),
      },
      recordAccess: {
        require: jest.fn().mockResolvedValue({}),
      },
      resolver,
    });

    await expect(
      dataService.findRelationOptions(
        'contracts',
        { displayField: 'name;drop' },
        {} as any,
      ),
    ).rejects.toThrow('displayField');
    expect(resolver.resolveForTarget).not.toHaveBeenCalled();
  });
});
