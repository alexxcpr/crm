import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  if (!await knex.schema.hasTable('ui_widget')) return;

  await knex.raw(`
    ALTER TABLE ui_widget
      ALTER COLUMN filters SET DEFAULT '[]'::jsonb
  `);

  await knex.raw(`
    UPDATE ui_widget
      SET filters = '[]'::jsonb
      WHERE filters IS NULL
         OR jsonb_typeof(filters) <> 'array'
  `);
}

export async function down(knex: Knex): Promise<void> {
  if (!await knex.schema.hasTable('ui_widget')) return;

  await knex.raw(`
    ALTER TABLE ui_widget
      ALTER COLUMN filters SET DEFAULT '{}'::jsonb
  `);
}
