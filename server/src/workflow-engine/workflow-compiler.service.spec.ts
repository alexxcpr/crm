import { WorkflowCompilerService } from './workflow-compiler.service';

function compiler() {
  const registry = {
    get: jest.fn((type: string) => {
      const definitions: Record<string, any> = {
        start: {
          type: 'start',
          version: 1,
          configFields: [],
          beforePolicy: 'all',
        },
        condition: {
          type: 'condition',
          version: 1,
          configFields: [],
          beforePolicy: 'all',
        },
        app_get_record: {
          type: 'app_get_record',
          version: 1,
          configFields: [],
          beforePolicy: 'all',
        },
        app_update_record: {
          type: 'app_update_record',
          version: 1,
          configFields: [],
          beforePolicy: 'insert-update',
        },
        for_each: {
          type: 'for_each',
          version: 1,
          configFields: [],
          beforePolicy: 'none',
        },
        email: {
          type: 'email',
          version: 1,
          configFields: [],
          beforePolicy: 'none',
        },
        set_data: {
          type: 'set_data',
          version: 1,
          configFields: [],
          beforePolicy: 'insert-update',
        },
        format_date: {
          type: 'format_date',
          version: 1,
          configFields: [
            {
              key: 'source',
              label: 'Data sursa',
              required: true,
              sourceModes: ['node_output'],
              acceptedDataTypes: [
                'date',
                'datetime',
                'timestamp',
              ],
            },
            {
              key: 'preset',
              label: 'Format',
              required: true,
              options: [
                {
                  label: 'Romanesc',
                  value: 'ro_numeric',
                },
                {
                  label: 'Lung',
                  value: 'ro_long',
                },
                {
                  label: 'Slash',
                  value: 'slash',
                },
                {
                  label: 'ISO',
                  value: 'iso',
                },
              ],
            },
          ],
          beforePolicy: 'all',
          outputKind: 'value',
          outputFields: [
            {
              key: 'date',
              label: 'Data formatata',
              dataType: 'varchar',
            },
            {
              key: 'datetime',
              label: 'Data si ora formatate',
              dataType: 'varchar',
            },
          ],
        },
      };
      return definitions[type];
    }),
  };
  const service = new WorkflowCompilerService(
    { knex: jest.fn() } as any,
    registry as any,
    {} as any,
  );
  jest
    .spyOn(service as any, 'resolveDependencies')
    .mockResolvedValue(undefined);
  return service;
}

describe('WorkflowCompilerService', () => {
  it('rezolva entitatile fara o coloana is_active inexistenta', async () => {
    const entitySelect = jest
      .fn()
      .mockResolvedValue([
        {
          id_entity: 'entity-1',
          slug: 'contacts',
        },
      ]);
    const fieldWhere = jest
      .fn()
      .mockResolvedValue([]);
    const fieldSelect = jest.fn(() => ({
      where: fieldWhere,
    }));
    const knex = jest.fn((table: string) =>
      table === 'entity'
        ? { select: entitySelect }
        : { select: fieldSelect },
    );
    const service = new WorkflowCompilerService(
      { knex } as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(
        service as any,
        'resolveFieldDependencies',
      )
      .mockResolvedValue(undefined);
    const entityIds = new Set<string>();
    const errors: any[] = [];

    await (service as any).resolveDependencies(
      [
        {
          id: 'start',
          type: 'start',
          parameters: { entity: 'contacts' },
        },
        {
          id: 'update',
          type: 'app_update_record',
          parameters: {
            entity: 'contacts',
            recordIdSource: {
              sourceType: 'node_output',
              value: 'id',
              sourceNodeId: 'start',
              sourceFieldSlug: 'id',
            },
          },
        },
      ],
      entityIds,
      new Set<string>(),
      new Set<string>(),
      new Set<string>(),
      errors,
    );

    expect(entitySelect).toHaveBeenCalledWith(
      'id_entity',
      'slug',
    );
    expect(entityIds).toContain('entity-1');
    expect(errors).toEqual([]);
    expect(fieldWhere).toHaveBeenCalledWith(
      'id_entity',
      'entity-1',
    );
  });

  it('permite filtre pe coloana sistem id fara metadata field', async () => {
    const where = jest.fn().mockResolvedValue([]);
    const select = jest.fn(() => ({ where }));
    const service = new WorkflowCompilerService(
      {
        knex: jest.fn(() => ({ select })),
      } as any,
      {} as any,
      {} as any,
    );
    const node = {
      id: 'read-sold',
      type: 'app_get_record',
      parameters: {
        entity: 'sold',
        filters: [
          {
            field: 'id',
            operator: 'eq',
            valueSource: {
              sourceType: 'static',
              value: 'record-1',
            },
          },
        ],
      },
    };
    const fieldIds = new Set<string>();
    const errors: any[] = [];

    await (
      service as any
    ).resolveFieldDependencies(
      node,
      new Map([['sold', 'entity-sold']]),
      fieldIds,
      errors,
    );

    expect(errors).toEqual([]);
    expect(fieldIds).toEqual(new Set());
    expect(
      node.parameters.filters[0],
    ).toMatchObject({
      field: 'id',
      fieldSnapshot: 'id',
      dataType: 'uuid',
    });
  });

  it('nu permite scrierea coloanei sistem id', async () => {
    const where = jest.fn().mockResolvedValue([]);
    const select = jest.fn(() => ({ where }));
    const service = new WorkflowCompilerService(
      {
        knex: jest.fn(() => ({ select })),
      } as any,
      {} as any,
      {} as any,
    );
    const errors: any[] = [];

    await (
      service as any
    ).resolveFieldDependencies(
      {
        id: 'update-sold',
        type: 'app_update_record',
        parameters: {
          entity: 'sold',
          fieldMappings: [
            {
              key: 'id',
              sourceType: 'static',
              value: 'record-2',
            },
          ],
        },
      },
      new Map([['sold', 'entity-sold']]),
      new Set<string>(),
      errors,
    );

    expect(
      errors.map((error) => error.code),
    ).toContain('field_not_found');
  });

  it('respinge Delay si Cod Custom', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'wait',
          type: 'delay',
          parameters: {},
        },
        {
          id: 'code',
          type: 'code',
          parameters: {},
        },
      ],
      [
        { source: 'start', target: 'wait' },
        { source: 'wait', target: 'code' },
      ],
    );
    expect(
      result.errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        'unsupported_delay',
        'unsupported_code',
      ]),
    );
  });

  it('respinge ciclurile si nodurile inaccesibile', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'a',
          type: 'condition',
          parameters: {},
        },
        {
          id: 'orphan',
          type: 'condition',
          parameters: {},
        },
      ],
      [
        { source: 'start', target: 'a' },
        {
          source: 'a',
          target: 'start',
          sourceHandle: 'true',
        },
      ],
    );
    expect(
      result.errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        'workflow_cycle',
        'unreachable_node',
      ]),
    );
  });

  it('aplica politica stricta pentru before_delete', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'mail',
          type: 'email',
          parameters: {},
        },
      ],
      [{ source: 'start', target: 'mail' }],
      { triggerEvents: ['before_delete'] },
    );
    expect(
      result.errors.map((error) => error.code),
    ).toContain('unsafe_before_node');
  });

  it('permite ID-ul recordului curent din START in before_update', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: { entity: 'contacts' },
        },
        {
          id: 'update',
          type: 'app_update_record',
          parameters: {
            entity: 'contacts',
            recordIdSource: {
              sourceType: 'node_output',
              value: 'id',
              sourceNodeId: 'start',
              sourceFieldSlug: 'id',
            },
          },
        },
      ],
      [{ source: 'start', target: 'update' }],
      { triggerEvents: ['before_update'] },
    );

    expect(
      result.errors.map((error) => error.code),
    ).not.toContain('unsafe_before_update');
  });

  it('respinge in before_update un ID care nu vine din START', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: { entity: 'contacts' },
        },
        {
          id: 'update',
          type: 'app_update_record',
          parameters: {
            entity: 'contacts',
            recordIdSource: {
              sourceType: 'static',
              value:
                '00000000-0000-0000-0000-000000000001',
            },
          },
        },
      ],
      [{ source: 'start', target: 'update' }],
      { triggerEvents: ['before_update'] },
    );

    expect(
      result.errors.map((error) => error.code),
    ).toContain('unsafe_before_update');
  });

  it('cere foreach pentru referintele la liste', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'list',
          type: 'app_get_record',
          parameters: { limit: null },
        },
        {
          id: 'calc',
          type: 'set_data',
          parameters: {
            assignments: [
              {
                key: 'total',
                tokens: [
                  {
                    type: 'field',
                    sourceNodeId: 'list',
                    fieldSlug: 'cf_total',
                  },
                ],
              },
            ],
          },
        },
      ],
      [
        { source: 'start', target: 'list' },
        { source: 'list', target: 'calc' },
      ],
    );
    expect(
      result.errors.map((error) => error.code),
    ).toContain('list_requires_foreach');
  });

  it('respinge referintele unui nod catre propriul output', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'calc',
          type: 'set_data',
          parameters: {
            assignments: [
              {
                key: 'total',
                tokens: [
                  {
                    type: 'field',
                    sourceNodeId: 'calc',
                    fieldSlug: 'total',
                  },
                ],
              },
            ],
          },
        },
      ],
      [{ source: 'start', target: 'calc' }],
    );

    expect(
      result.errors.map((error) => error.code),
    ).toContain('invalid_upstream_reference');
  });

  it('respinge operatorii si operanzii cu tipuri incompatibile', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'if',
          type: 'condition',
          parameters: {
            conditions: [
              {
                leftOperand: {
                  sourceType: 'static',
                  value: 10,
                  dataType: 'integer',
                },
                operator: 'contains',
                rightOperand: {
                  sourceType: 'static',
                  value: '1',
                  dataType: 'varchar',
                },
              },
            ],
          },
        },
      ],
      [{ source: 'start', target: 'if' }],
    );

    expect(
      result.errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        'condition_operator_type_mismatch',
        'condition_operand_type_mismatch',
      ]),
    );
  });

  it('respinge formulele aritmetice cu text', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'calc',
          type: 'set_data',
          parameters: {
            assignments: [
              {
                key: 'total',
                tokens: [
                  {
                    type: 'literal',
                    value: 'abc',
                  },
                  {
                    type: 'operator',
                    value: '*',
                  },
                  { type: 'literal', value: '2' },
                ],
              },
            ],
          },
        },
      ],
      [{ source: 'start', target: 'calc' }],
    );

    expect(
      result.errors.map((error) => error.code),
    ).toContain('formula_type_mismatch');
  });

  it('permite format_date cu o sursa Datetime inclusiv in before_delete', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'format',
          type: 'format_date',
          parameters: {
            source: {
              sourceType: 'node_output',
              sourceNodeId: 'start',
              sourceFieldSlug: 'date_created',
              dataType: 'timestamp',
            },
            preset: 'ro_numeric',
          },
        },
      ],
      [{ source: 'start', target: 'format' }],
      { triggerEvents: ['before_delete'] },
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('respinge sursa statica, tipul incompatibil si presetul invalid pentru format_date', async () => {
    const service = compiler();
    const result = await service.compile(
      [
        {
          id: 'start',
          type: 'start',
          parameters: {},
        },
        {
          id: 'static-format',
          type: 'format_date',
          parameters: {
            source: {
              sourceType: 'static',
              value: '2026-07-19',
            },
            preset: 'ro_numeric',
          },
        },
        {
          id: 'text-format',
          type: 'format_date',
          parameters: {
            source: {
              sourceType: 'node_output',
              sourceNodeId: 'start',
              sourceFieldSlug: 'name',
              dataType: 'varchar',
            },
            preset: 'format-necunoscut',
          },
        },
      ],
      [
        {
          source: 'start',
          target: 'static-format',
        },
        {
          source: 'start',
          target: 'text-format',
        },
      ],
    );

    expect(
      result.errors.map((error) => error.code),
    ).toEqual(
      expect.arrayContaining([
        'invalid_source_mode',
        'source_type_mismatch',
        'invalid_config_option',
      ]),
    );
  });

  it('rezolva outputurile declarate de registry si respinge outputurile inexistente', async () => {
    const service = compiler();
    const validReference = {
      sourceType: 'node_output',
      sourceNodeId: 'format',
      sourceFieldSlug: 'datetime',
    };
    const invalidReference = {
      sourceType: 'node_output',
      sourceNodeId: 'format',
      sourceFieldSlug: 'missing',
    };
    const errors: any[] = [];

    await (
      service as any
    ).resolveSourceFieldDependencies(
      [
        {
          id: 'format',
          type: 'format_date',
          parameters: {},
        },
        {
          id: 'valid-consumer',
          type: 'set_data',
          parameters: {
            value: validReference,
          },
        },
        {
          id: 'invalid-consumer',
          type: 'set_data',
          parameters: {
            value: invalidReference,
          },
        },
      ],
      new Map(),
      new Set<string>(),
      errors,
    );

    expect(validReference).toMatchObject({
      sourceFieldSnapshot: 'datetime',
      dataType: 'varchar',
    });
    expect(errors).toEqual([
      expect.objectContaining({
        code: 'source_field_not_found',
        nodeId: 'invalid-consumer',
      }),
    ]);
  });

  it('determina tipul campului Date dintr-un item Pentru Fiecare', async () => {
    const service = compiler();
    const where = jest.fn().mockResolvedValue([]);
    const select = jest.fn(() => ({ where }));
    (service as any).tenantContext = {
      knex: jest.fn(() => ({ select })),
    };
    const source = {
      sourceType: 'node_output',
      sourceNodeId: 'loop',
      sourceFieldSlug: 'date_created',
    };
    const errors: any[] = [];

    await (
      service as any
    ).resolveSourceFieldDependencies(
      [
        {
          id: 'list',
          type: 'app_get_record',
          parameters: { entity: 'contacts' },
        },
        {
          id: 'loop',
          type: 'for_each',
          parameters: {
            sourceNodeId: 'list',
          },
        },
        {
          id: 'format',
          type: 'format_date',
          parameters: { source },
        },
      ],
      new Map([['contacts', 'entity-1']]),
      new Set<string>(),
      errors,
      [
        {
          source: 'list',
          target: 'loop',
        },
        {
          source: 'loop',
          target: 'format',
        },
      ],
    );

    expect(source).toMatchObject({
      sourceFieldSnapshot: 'date_created',
      dataType: 'timestamp',
    });
    expect(errors).toEqual([]);
  });
});
