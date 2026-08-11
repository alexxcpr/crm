import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE field AS relation_field
       SET relation_display_field = display_field.slug,
           date_updated = NOW()
      FROM field AS display_field
     WHERE relation_field.ui_type = 'relation'
       AND relation_field.id_relation_entity = display_field.id_entity
       AND relation_field.relation_display_field = display_field.column_name
       AND NOT EXISTS (
         SELECT 1
           FROM field AS logical_match
          WHERE logical_match.id_entity = relation_field.id_relation_entity
            AND logical_match.slug = relation_field.relation_display_field
            AND logical_match.id_field <> display_field.id_field
       )
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE field AS relation_field
       SET relation_display_field = display_field.column_name,
           date_updated = NOW()
      FROM field AS display_field
     WHERE relation_field.ui_type = 'relation'
       AND relation_field.id_relation_entity = display_field.id_entity
       AND relation_field.relation_display_field = display_field.slug
       AND NOT EXISTS (
         SELECT 1
           FROM field AS physical_match
          WHERE physical_match.id_entity = relation_field.id_relation_entity
            AND physical_match.column_name = relation_field.relation_display_field
            AND physical_match.id_field <> display_field.id_field
       )
  `);
}
