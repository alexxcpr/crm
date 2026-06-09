import { BadRequestException } from '@nestjs/common';
import { DynamicValidationService } from './dynamic-validation.service';
import { FieldWithRelation } from 'src/types/entities';

function mockField(overrides: Partial<FieldWithRelation> = {}): FieldWithRelation {
  return {
    id_field: 'field-1',
    id_entity: 'entity-1',
    name: 'Numar',
    slug: 'numar',
    column_name: 'cf_numar',
    data_type: 'integer',
    ui_type: 'number',
    default_value: null,
    placeholder: null,
    help_text: null,
    options: null,
    is_required: true,
    is_unique: false,
    is_filterable: true,
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

describe('DynamicValidationService', () => {
  let service: DynamicValidationService;

  beforeEach(() => {
    service = new DynamicValidationService({ knex: jest.fn() } as any);
  });

  it('respinge camp required gol la update cand este trimis in payload', async () => {
    await expect(
      service.validateAndSanitize(
        { numar: null },
        [mockField()],
        'ent_contacts',
        'update',
        'record-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('permite update partial cand campul required lipseste din payload', async () => {
    await expect(
      service.validateAndSanitize(
        {},
        [mockField()],
        'ent_contacts',
        'update',
        'record-1',
      ),
    ).resolves.toEqual({});
  });
});
