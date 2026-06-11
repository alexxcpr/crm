import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Păstrăm ui_type corect pentru fostele timestamp-uri
  await knex('field')
    .where('data_type', 'timestamp')
    .update({ ui_type: 'datetimepicker', date_updated: knex.fn.now() });

  // 2. Unificare date + timestamp → datetime
  await knex('field')
    .whereIn('data_type', ['date', 'timestamp'])
    .update({ data_type: 'datetime', date_updated: knex.fn.now() });

  // 3. Șterge câmpurile cu data_type = 'jsonb'
  await knex('field').where('data_type', 'jsonb').del();

  // 4. Șterge câmpurile cu ui_type = 'multi-select' sau 'radio'
  await knex('field').whereIn('ui_type', ['multi-select', 'radio']).del();

  // 5. Șterge extra_data de pe toate tabelele ent_*
  const entities = await knex('entity').select('table_name');
  for (const entity of entities) {
    if (await knex.schema.hasColumn(entity.table_name, 'extra_data')) {
      await knex.schema.alterTable(entity.table_name, (t) => {
        t.dropColumn('extra_data');
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Re-adăugăm extra_data pe toate tabelele ent_*
  const entities = await knex('entity').select('table_name');
  for (const entity of entities) {
    if (!(await knex.schema.hasColumn(entity.table_name, 'extra_data'))) {
      await knex.schema.alterTable(entity.table_name, (t) => {
        t.jsonb('extra_data').defaultTo('{}');
      });
    }
  }
  // Notă: down-ul pentru data_type și câmpurile șterse este lossy —
  // nu putem recupera câmpurile jsonb/multi-select/radio șterse,
  // și nu putem distinge între fostele date și timestamp.
  // Acest down este best-effort (readaugă doar extra_data).
}
