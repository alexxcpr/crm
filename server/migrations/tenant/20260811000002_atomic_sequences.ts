import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.createTable(
      'sequence_definition',
      (table) => {
        table
          .uuid('id_sequence_definition')
          .primary()
          .defaultTo(trx.fn.uuid());
        table.string('key', 100).notNullable().unique();
        table.string('scope', 20).notNullable();
        table.string('reset', 20).notNullable();
        table.string('format', 255).notNullable();
        table.string('prefix', 100).notNullable().defaultTo('');
        table.smallint('padding').notNullable().defaultTo(1);
        table.bigInteger('start_value').notNullable().defaultTo(1);
        table
          .timestamp('date_created', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
        table
          .timestamp('date_updated', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
      },
    );
    await trx.raw(`
      ALTER TABLE sequence_definition
        ADD CONSTRAINT sequence_definition_scope_check
          CHECK (scope IN ('global', 'entity')),
        ADD CONSTRAINT sequence_definition_reset_check
          CHECK (reset IN ('none', 'yearly')),
        ADD CONSTRAINT sequence_definition_padding_check
          CHECK (padding BETWEEN 1 AND 18),
        ADD CONSTRAINT sequence_definition_start_check
          CHECK (start_value >= 1)
    `);

    await trx.schema.createTable(
      'sequence_counter',
      (table) => {
        table
          .uuid('id_sequence_definition')
          .notNullable()
          .references('id_sequence_definition')
          .inTable('sequence_definition')
          .onDelete('RESTRICT');
        table.string('scope_key', 100).notNullable();
        table.string('period_key', 20).notNullable();
        table.bigInteger('last_value').notNullable();
        table
          .timestamp('date_created', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
        table
          .timestamp('date_updated', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
        table.primary(
          [
            'id_sequence_definition',
            'scope_key',
            'period_key',
          ],
          { constraintName: 'sequence_counter_pk' },
        );
      },
    );
    await trx.raw(`
      ALTER TABLE sequence_counter
        ADD CONSTRAINT sequence_counter_value_check
          CHECK (last_value >= 1)
    `);

    await trx.schema.alterTable('field', (table) => {
      table
        .uuid('id_sequence_definition')
        .nullable()
        .references('id_sequence_definition')
        .inTable('sequence_definition')
        .onDelete('SET NULL');
      table.index(
        'id_sequence_definition',
        'field_sequence_definition_idx',
      );
    });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('field', (table) => {
      table.dropIndex(
        'id_sequence_definition',
        'field_sequence_definition_idx',
      );
      table.dropColumn('id_sequence_definition');
    });
    await trx.schema.dropTableIfExists('sequence_counter');
    await trx.schema.dropTableIfExists(
      'sequence_definition',
    );
  });
}
