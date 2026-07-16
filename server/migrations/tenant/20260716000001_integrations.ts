import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('integration_definition', (t) => {
    t.uuid('id_integration').primary().defaultTo(knex.fn.uuid());
    t.string('type', 50).notNullable();
    t.string('name', 120).notNullable();
    t.jsonb('config').notNullable().defaultTo('{}');
    t.text('secret_encrypted').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.uuid('id_replaced_by').nullable()
      .references('id_integration').inTable('integration_definition').onDelete('SET NULL');
    t.timestamp('date_deleted', { useTz: true }).nullable();
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['type', 'is_active'], 'integration_definition_type_active_idx');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX integration_definition_type_name_unique
      ON integration_definition (type, name)
      WHERE date_deleted IS NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('integration_definition');
}
