import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('action_definition', (t) => {
    t.string('description', 500).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('action_definition', (t) => {
    t.dropColumn('description');
  });
}
