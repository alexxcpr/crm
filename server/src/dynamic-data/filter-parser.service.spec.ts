import knex from 'knex';
import { FieldWithRelation } from 'src/types/entities';
import { FilterParserService } from './filter-parser.service';

function mockField(overrides: Partial<FieldWithRelation> = {}): FieldWithRelation {
  return {
    id_field: 'field-1',
    id_entity: 'entity-1',
    name: 'Nume',
    slug: 'name',
    column_name: 'cf_name',
    data_type: 'varchar',
    ui_type: 'text',
    default_value: null,
    placeholder: null,
    help_text: null,
    options: null,
    is_required: false,
    is_unique: false,
    is_filterable: false,
    is_sortable: true,
    visible_in_table: true,
    visible_in_form: true,
    is_system: false,
    validation_rules: null,
    id_relation_entity: null,
    relation_display_field: null,
    relation_entity: null,
    id_ui_tab: '00000000-0000-0000-0000-000000000001',
    rank: 1,
    grid_col: 1,
    col_span: 1,
    date_created: new Date('2026-01-01'),
    date_updated: new Date('2026-01-01'),
    ...overrides,
  };
}

describe('FilterParserService', () => {
  let service: FilterParserService;

  beforeEach(() => {
    service = new FilterParserService();
  });

  it('permite filtrarea pe campuri vizibile chiar daca nu sunt marcate is_filterable', () => {
    const filters = service.parse(
      { filter: { cf_name: [{ op: 'contains', value: 'alex' }] } },
      [mockField({ is_filterable: false, visible_in_table: true })],
      'ent_contacts',
    );

    expect(filters).toEqual([
      {
        column: 'ent_contacts.cf_name',
        conditions: [{ operator: 'contains', value: 'alex' }],
      },
    ]);
  });

  it('permite filtre speciale pe campuri is_filterable chiar daca nu sunt vizibile in tabel', () => {
    const filters = service.parse(
      { filter: { cf_name: [{ op: 'eq', value: 'abc' }] } },
      [mockField({ is_filterable: true, visible_in_table: false })],
      'ent_contacts',
    );

    expect(filters).toHaveLength(1);
  });

  it('ignora operatorii nevalidi pentru tipul de date', () => {
    const filters = service.parse(
      { filter: { cf_amount: [{ op: 'contains', value: '10' }] } },
      [mockField({
        slug: 'amount',
        column_name: 'cf_amount',
        data_type: 'numeric',
        ui_type: 'currency',
      })],
      'ent_contacts',
    );

    expect(filters).toEqual([]);
  });

  it('normalizeaza numeric, between si boolean', () => {
    const filters = service.parse(
      {
        filter: {
          cf_amount: [{ op: 'between', value: '10.5,20.75' }],
          cf_active: [{ op: 'eq', value: 'true' }],
        },
      },
      [
        mockField({ slug: 'amount', column_name: 'cf_amount', data_type: 'numeric', ui_type: 'currency' }),
        mockField({ slug: 'active', column_name: 'cf_active', data_type: 'boolean', ui_type: 'checkbox' }),
      ],
      'ent_contacts',
    );

    expect(filters).toEqual([
      {
        column: 'ent_contacts.cf_amount',
        conditions: [{ operator: 'between', value: [10.5, 20.75] }],
      },
      {
        column: 'ent_contacts.cf_active',
        conditions: [{ operator: 'eq', value: true }],
      },
    ]);
  });

  it('suporta relatie cu in si is_null', () => {
    const filters = service.parse(
      {
        filter: {
          cf_company_id: [
            { op: 'in', value: 'id-1,id-2' },
            { op: 'is_null', value: 'true' },
          ],
        },
      },
      [mockField({
        slug: 'company',
        column_name: 'cf_company_id',
        data_type: 'uuid',
        ui_type: 'relation',
      })],
      'ent_contacts',
    );

    expect(filters).toEqual([
      {
        column: 'ent_contacts.cf_company_id',
        conditions: [
          { operator: 'in', value: ['id-1', 'id-2'] },
          { operator: 'is_null', value: true },
        ],
      },
    ]);
  });

  it('aplica OR pentru conditii multiple pe aceeasi coloana', () => {
    const db = knex({ client: 'pg' });
    const query = db('ent_contacts').select('*');
    const [filter] = service.parse(
      {
        filter: {
          cf_name: [
            { op: 'eq', value: 'abc' },
            { op: 'eq', value: 'xyz' },
          ],
        },
      },
      [mockField()],
      'ent_contacts',
    );

    service.apply(query, filter!);

    const sql = query.toSQL();
    expect(sql.sql).toContain('where');
    expect(sql.sql).toContain('or');
    expect(sql.bindings).toEqual(['abc', 'xyz']);
  });
});
