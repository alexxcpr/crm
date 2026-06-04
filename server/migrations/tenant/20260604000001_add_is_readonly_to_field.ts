import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('field', (t) => {
    t.boolean('is_readonly').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('field', (t) => {
    t.dropColumn('is_readonly');
  });
}
