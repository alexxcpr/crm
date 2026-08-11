import knex, { Knex } from 'knex';
import { randomUUID } from 'node:crypto';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type {
  Entity,
  FieldWithRelation,
  SequenceDefinition,
} from 'src/types/entities';
import { SequenceService } from './sequence.service';
import { DynamicDataService } from 'src/dynamic-data/dynamic-data.service';
import { DynamicValidationService } from 'src/dynamic-data/dynamic-validation.service';
import { EntityEvent } from 'src/events/entity-event.enum';

const databaseUrl =
  process.env.SEQUENCE_TEST_DATABASE_URL ??
  process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? describe : describe.skip;

integration('SequenceService PostgreSQL concurrency', () => {
  const schemaName = `sequence_test_${randomUUID().replace(/-/g, '')}`;
  let bootstrap: Knex;
  let db: Knex;
  let context: TenantContext;
  let service: SequenceService;

  const entityA = {
    id_entity: randomUUID(),
    table_name: 'ent_sequence_a',
  } as Entity;
  const entityB = {
    id_entity: randomUUID(),
    table_name: 'ent_sequence_b',
  } as Entity;
  const entityDynamic = {
    id_entity: randomUUID(),
    slug: 'sequence_dynamic',
    table_name: 'ent_sequence_dynamic',
  } as Entity;

  function definition(
    overrides: Partial<SequenceDefinition> = {},
  ): SequenceDefinition {
    return {
      id_sequence_definition: randomUUID(),
      key: `sequence_${randomUUID().replace(/-/g, '')}`,
      scope: 'global',
      reset: 'none',
      format: '{prefix}{number}',
      prefix: 'SEQ-',
      padding: 1,
      start_value: 1,
      ...overrides,
    };
  }

  function field(
    sequence: SequenceDefinition,
  ): FieldWithRelation {
    return {
      id_field: randomUUID(),
      name: 'Numar',
      slug: 'number',
      column_name: 'cf_number',
      sequence,
    } as FieldWithRelation;
  }

  async function insertDefinition(value: SequenceDefinition) {
    await db('sequence_definition').insert(value);
  }

  async function allocateAndInsert(
    entity: Entity,
    sequenceField: FieldWithRelation,
  ) {
    return context.run(
      {
        knex: db,
        slug: 'sequence-test',
        dbName: 'sequence-test',
      },
      () =>
        db.transaction(async (trx) =>
          context.runWithTransaction(trx, async () => {
            const data: Record<string, any> = {};
            await service.allocateForRecord(
              trx,
              entity,
              [sequenceField],
              data,
            );
            await trx(entity.table_name).insert({
              cf_number: data.cf_number,
            });
            return data.cf_number as string;
          }),
        ),
    );
  }

  beforeAll(async () => {
    bootstrap = knex({
      client: 'pg',
      connection: databaseUrl,
      pool: { min: 0, max: 2 },
    });
    await bootstrap.raw('CREATE SCHEMA ??', [schemaName]);
    db = knex({
      client: 'pg',
      connection: databaseUrl,
      searchPath: [schemaName],
      pool: { min: 0, max: 25 },
    });
    await db.schema.createTable(
      'tenant_configuration',
      (table) => {
        table.smallint('id_configuration').primary();
        table.string('timezone', 100).notNullable();
      },
    );
    await db('tenant_configuration').insert({
      id_configuration: 1,
      timezone: 'Europe/Bucharest',
    });
    await db.schema.createTable(
      'sequence_definition',
      (table) => {
        table
          .uuid('id_sequence_definition')
          .primary()
          .defaultTo(db.fn.uuid());
        table.string('key', 100).notNullable().unique();
        table.string('scope', 20).notNullable();
        table.string('reset', 20).notNullable();
        table.string('format', 255).notNullable();
        table.string('prefix', 100).notNullable();
        table.smallint('padding').notNullable();
        table.bigInteger('start_value').notNullable();
      },
    );
    await db.schema.createTable('sequence_counter', (table) => {
      table.uuid('id_sequence_definition').notNullable();
      table.string('scope_key', 100).notNullable();
      table.string('period_key', 20).notNullable();
      table.bigInteger('last_value').notNullable();
      table.timestamp('date_created', { useTz: true });
      table.timestamp('date_updated', { useTz: true });
      table.primary([
        'id_sequence_definition',
        'scope_key',
        'period_key',
      ]);
    });
    for (const tableName of [
      entityA.table_name,
      entityB.table_name,
    ]) {
      await db.schema.createTable(tableName, (table) => {
        table.increments('id').primary();
        table.string('cf_number', 255).notNullable().unique();
      });
    }
    await db.schema.createTable('field', (table) => {
      table.uuid('id_field').primary();
      table.uuid('id_entity').notNullable();
      table.string('name', 100).notNullable();
      table.string('slug', 100).notNullable();
      table.string('column_name', 100).notNullable();
      table.string('data_type', 50).notNullable();
      table.string('ui_type', 50).notNullable();
      table.text('default_value').nullable();
      table.boolean('visible_in_form').notNullable();
      table.boolean('visible_in_table').notNullable();
      table.boolean('is_required').notNullable();
      table.boolean('is_unique').notNullable();
      table.boolean('is_readonly').notNullable();
      table.jsonb('validation_rules').nullable();
      table.uuid('id_relation_entity').nullable();
      table.uuid('id_sequence_definition').nullable();
      table.integer('rank').notNullable();
    });
    await db.schema.createTable(
      entityDynamic.table_name,
      (table) => {
        table.increments('id').primary();
        table.string('cf_number', 255).notNullable().unique();
        table.uuid('id_profile').nullable();
        table.timestamp('date_created', { useTz: true });
        table.timestamp('date_updated', { useTz: true });
      },
    );
    await db.schema.createTable(
      'workflow_side_effect',
      (table) => {
        table.increments('id').primary();
        table.string('generated_value', 255).notNullable();
      },
    );
    await db.schema.createTable('ent_sequence_activation', (table) => {
      table.increments('id').primary();
      table.string('cf_number', 255).nullable();
    });
    context = new TenantContext();
    service = new SequenceService(context);
  }, 30_000);

  afterAll(async () => {
    if (db) await db.destroy();
    if (bootstrap) {
      await bootstrap.raw('DROP SCHEMA IF EXISTS ?? CASCADE', [
        schemaName,
      ]);
      await bootstrap.destroy();
    }
  }, 30_000);

  it('aloca 500 de valori unice si continue in tranzactii paralele', async () => {
    const sequence = definition({
      key: 'parallel_500',
      prefix: 'PAR-',
    });
    await insertDefinition(sequence);
    const sequenceField = field(sequence);
    const values = await Promise.all(
      Array.from({ length: 500 }, () =>
        allocateAndInsert(entityA, sequenceField),
      ),
    );
    expect(new Set(values).size).toBe(500);
    expect(
      values
        .map((value) => Number(value.replace(/^PAR-/, '')))
        .sort((left, right) => left - right),
    ).toEqual(Array.from({ length: 500 }, (_, index) => index + 1));
  }, 60_000);

  it('partajeaza scope-ul global intre doua entitati', async () => {
    const sequence = definition({
      key: 'global_two_entities',
      prefix: 'GLB-',
    });
    await insertDefinition(sequence);
    const values = await Promise.all([
      ...Array.from({ length: 50 }, () =>
        allocateAndInsert(entityA, field(sequence)),
      ),
      ...Array.from({ length: 50 }, () =>
        allocateAndInsert(entityB, field(sequence)),
      ),
    ]);
    expect(new Set(values).size).toBe(100);
  }, 30_000);

  it('separa contoarele cu scope entity', async () => {
    const sequence = definition({
      key: 'per_entity',
      scope: 'entity',
      prefix: 'ENT-',
    });
    await insertDefinition(sequence);
    const [left, right] = await Promise.all([
      allocateAndInsert(entityA, field(sequence)),
      allocateAndInsert(entityB, field(sequence)),
    ]);
    expect(left).toBe('ENT-1');
    expect(right).toBe('ENT-1');
  });

  it('reutilizeaza valoarea unei tranzactii anulate', async () => {
    const sequence = definition({
      key: 'rollback_reuse',
      prefix: 'ROLL-',
    });
    await insertDefinition(sequence);
    const sequenceField = field(sequence);
    await expect(
      context.run(
        {
          knex: db,
          slug: 'sequence-test',
          dbName: 'sequence-test',
        },
        () =>
          db.transaction(async (trx) => {
            const data: Record<string, any> = {};
            await service.allocateForRecord(
              trx,
              entityA,
              [sequenceField],
              data,
            );
            throw new Error('rollback intentionat');
          }),
      ),
    ).rejects.toThrow('rollback intentionat');
    expect(
      await allocateAndInsert(entityA, sequenceField),
    ).toBe('ROLL-1');
  });

  it('foloseste anul curent drept cheie pentru resetarea anuala', async () => {
    const sequence = definition({
      key: 'annual_period',
      reset: 'yearly',
      format: '{prefix}{year}-{number}',
      prefix: 'YEAR-',
    });
    await insertDefinition(sequence);
    await allocateAndInsert(entityA, field(sequence));
    const counter = await db('sequence_counter')
      .where(
        'id_sequence_definition',
        sequence.id_sequence_definition,
      )
      .first();
    const expectedYear = service.dateParts(
      new Date(),
      'Europe/Bucharest',
    ).year;
    expect(counter.period_key).toBe(expectedYear);
  });

  it('expune numarul in before_insert si anuleaza impreuna hook-ul, recordul si contorul', async () => {
    const sequence = definition({
      key: 'dynamic_before_insert',
      prefix: 'HOOK-',
    });
    await insertDefinition(sequence);
    await db('field').insert({
      id_field: randomUUID(),
      id_entity: entityDynamic.id_entity,
      name: 'Numar',
      slug: 'number',
      column_name: 'cf_number',
      data_type: 'varchar',
      ui_type: 'text',
      default_value: null,
      visible_in_form: true,
      visible_in_table: true,
      is_required: false,
      is_unique: true,
      is_readonly: true,
      validation_rules: null,
      id_relation_entity: null,
      id_sequence_definition:
        sequence.id_sequence_definition,
      rank: 1,
    });

    let failBefore = false;
    const events = {
      emit: jest.fn(
        async (
          event: EntityEvent,
          payload: { data: Record<string, any> },
        ) => {
          if (event !== EntityEvent.BeforeInsert) return;
          expect(payload.data.cf_number).toMatch(/^HOOK-\d+$/);
          await context.knex('workflow_side_effect').insert({
            generated_value: payload.data.cf_number,
          });
          if (failBefore) throw new Error('before esuat');
        },
      ),
    };
    const dynamicData = new DynamicDataService(
      context,
      {} as any,
      new DynamicValidationService(context),
      events as any,
      {
        getEntity: jest.fn().mockResolvedValue(entityDynamic),
      } as any,
      {
        require: jest.fn().mockResolvedValue({}),
        compositionChain: jest
          .fn()
          .mockResolvedValue({ steps: [] }),
      } as any,
      {
        validateFileForBinding: jest.fn(),
        bindInTransaction: jest.fn(),
      } as any,
      {
        enrichFields: jest.fn(async (fields) =>
          fields.map((value: Record<string, any>) => ({
            ...value,
            relation_entity: null,
            relation_display_column: null,
          })),
        ),
      } as any,
      service,
    );
    const actor = { id: null, profileId: null } as any;
    const runCreate = () =>
      context.run(
        {
          knex: db,
          slug: 'sequence-test',
          dbName: 'sequence-test',
        },
        () => dynamicData.create(entityDynamic.slug, {}, actor),
      );

    const first = await runCreate();
    expect(first.data.cf_number).toBe('HOOK-1');
    expect(await db('workflow_side_effect').count('* as total').first())
      .toMatchObject({ total: '1' });

    failBefore = true;
    await expect(runCreate()).rejects.toThrow('before esuat');
    expect(await db(entityDynamic.table_name).count('* as total').first())
      .toMatchObject({ total: '1' });
    expect(await db('workflow_side_effect').count('* as total').first())
      .toMatchObject({ total: '1' });

    failBefore = false;
    const second = await runCreate();
    expect(second.data.cf_number).toBe('HOOK-2');
  });

  it('reutilizeaza configuratia canonica si refuza drift-ul de manifest', async () => {
    const manifest = {
      key: 'canonical_manifest',
      scope: 'global' as const,
      reset: 'none' as const,
      format: '{prefix}{number}',
      prefix: 'CAN-',
      padding: 3,
      start_value: 10,
    };
    const created = await service.resolveDefinition(db, manifest);
    const reused = await service.resolveDefinition(db, manifest);
    expect(reused.id_sequence_definition).toBe(
      created.id_sequence_definition,
    );
    await expect(
      service.resolveDefinition(db, {
        ...manifest,
        prefix: 'DRIFT-',
      }),
    ).rejects.toThrow('alta configuratie');
  });

  it('blocheaza modificarea configuratiei dupa prima alocare', async () => {
    const manifest = {
      key: 'immutable_after_use',
      scope: 'global' as const,
      reset: 'none' as const,
      format: '{prefix}{number}',
      prefix: 'IMM-',
      padding: 1,
      start_value: 1,
    };
    const created = await service.resolveDefinition(db, manifest);
    await db.transaction(async (trx) => {
      await service.allocateForRecord(
        trx,
        entityA,
        [field(created)],
        {},
      );
    });
    await expect(
      service.resolveDefinition(
        db,
        { ...manifest, prefix: 'NEW-' },
        {
          currentDefinitionId:
            created.id_sequence_definition,
          currentFieldId: randomUUID(),
        },
      ),
    ).rejects.toThrow('imutabila');
  });

  it('permite activarea numai cand valorile existente sunt NULL', async () => {
    await db('ent_sequence_activation').insert({
      cf_number: null,
    });
    await expect(
      service.assertColumnContainsOnlyNulls(
        db,
        'ent_sequence_activation',
        'cf_number',
      ),
    ).resolves.toBeUndefined();
    await db('ent_sequence_activation').insert({
      cf_number: 'manual-1',
    });
    await expect(
      service.assertColumnContainsOnlyNulls(
        db,
        'ent_sequence_activation',
        'cf_number',
      ),
    ).rejects.toThrow('toate NULL');
  });
});
