import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasIsReadonly = await knex.schema.hasColumn('field', 'is_readonly');
  if (hasIsReadonly) {
    return;
  }

  await knex.schema.alterTable('field', (t) => {
    t.boolean('is_readonly').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasIsReadonly = await knex.schema.hasColumn('field', 'is_readonly');
  if (!hasIsReadonly) {
    return;
  }

  await knex.schema.alterTable('field', (t) => {
    t.dropColumn('is_readonly');
  });
}
