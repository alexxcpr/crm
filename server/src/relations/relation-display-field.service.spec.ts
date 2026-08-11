import { BadRequestException } from '@nestjs/common';
import { RelationDisplayFieldService } from './relation-display-field.service';

const displayFields = [
  'name',
  'display_name',
  'asset_code',
  'contract_number',
].map((slug, index) => ({
  id_field: `display-${index}`,
  id_entity: 'target-entity',
  slug,
  column_name: `cf_${slug}`,
}));

function batchService(rows = displayFields) {
  const query: any = {
    whereIn: jest.fn().mockReturnThis(),
    select: jest.fn().mockResolvedValue(rows),
  };
  const knex = jest.fn(() => query);
  return {
    service: new RelationDisplayFieldService({ knex } as any),
    knex,
    query,
  };
}

function lookupService(rows: any[]) {
  const condition: any = {
    where: jest.fn().mockReturnThis(),
    orWhere: jest.fn().mockReturnThis(),
  };
  const query: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn((callback) => {
      callback(condition);
      return query;
    }),
    select: jest.fn().mockResolvedValue(rows),
  };
  const knex = jest.fn(() => query);
  return {
    service: new RelationDisplayFieldService({ knex } as any),
    knex,
    query,
  };
}

describe('RelationDisplayFieldService', () => {
  it.each([
    ['name', 'name', 'cf_name'],
    ['cf_name', 'name', 'cf_name'],
    ['display_name', 'display_name', 'cf_display_name'],
    ['cf_display_name', 'display_name', 'cf_display_name'],
    ['asset_code', 'asset_code', 'cf_asset_code'],
    ['cf_asset_code', 'asset_code', 'cf_asset_code'],
    ['contract_number', 'contract_number', 'cf_contract_number'],
    ['cf_contract_number', 'contract_number', 'cf_contract_number'],
  ])(
    'rezolva %s la slug %s si coloana %s',
    async (reference, slug, column) => {
      const { service, query } = batchService();
      const [resolved] = await service.enrichFields([
        {
          id_field: 'relation',
          name: 'Relatie',
          slug: 'relation',
          ui_type: 'relation',
          id_relation_entity: 'target-entity',
          relation_display_field: reference,
        },
      ]);

      expect(resolved.relation_display_field).toBe(slug);
      expect(resolved.relation_display_column).toBe(column);
      expect(query.select).toHaveBeenCalledTimes(1);
    },
  );

  it('incarca metadata tinta o singura data pentru mai multe relatii', async () => {
    const { service, query } = batchService();
    await service.enrichFields(
      displayFields.map((field) => ({
        id_field: `relation-${field.slug}`,
        ui_type: 'relation',
        id_relation_entity: 'target-entity',
        relation_display_field: field.slug,
      })),
    );
    expect(query.select).toHaveBeenCalledTimes(1);
  });

  it('respinge identificatori inexistenti fara a-i folosi in SQL', async () => {
    const { service, knex, query } = lookupService([]);
    await expect(
      service.resolveForTarget(
        'target-entity',
        'name; drop table field',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(knex).toHaveBeenCalledWith('field');
    expect(query.where).toHaveBeenCalledWith(
      'id_entity',
      'target-entity',
    );
  });

  it('respinge o referinta ambigua', async () => {
    const { service } = lookupService([
      displayFields[0],
      displayFields[1],
    ]);
    await expect(
      service.resolveForTarget(
        'target-entity',
        'cf_name',
      ),
    ).rejects.toThrow('ambiguu');
  });
});
