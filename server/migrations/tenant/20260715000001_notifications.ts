import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('notification', (t) => {
    t.uuid('id_notification').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_profile').notNullable()
      .references('id_profile').inTable('profile').onDelete('CASCADE');
    t.string('subject', 255).notNullable();
    t.text('content').notNullable();
    t.boolean('is_read').notNullable().defaultTo(false);
    t.timestamp('date_read', { useTz: true }).nullable();
    t.uuid('id_target_entity').nullable()
      .references('id_entity').inTable('entity').onDelete('SET NULL');
    t.uuid('target_record_id').nullable();
    t.string('source_execution_id', 200).notNullable();
    t.string('source_node_id', 200).notNullable();
    t.integer('source_run_index').notNullable().defaultTo(0);
    t.integer('source_item_index').notNullable().defaultTo(0);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(
      ['source_execution_id', 'source_node_id', 'source_run_index', 'source_item_index'],
      { indexName: 'notification_execution_node_item_unique' },
    );
  });

  await knex.raw(`
    CREATE FUNCTION notification_clear_target_record_on_entity_delete()
    RETURNS trigger AS $$
    BEGIN
      IF OLD.id_target_entity IS NOT NULL AND NEW.id_target_entity IS NULL THEN
        NEW.target_record_id := NULL;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  await knex.raw(`
    CREATE TRIGGER notification_clear_target_record_trigger
      BEFORE UPDATE OF id_target_entity ON notification
      FOR EACH ROW
      EXECUTE FUNCTION notification_clear_target_record_on_entity_delete()
  `);

  await knex.raw(`
    ALTER TABLE notification
      ADD CONSTRAINT notification_target_pair_check
      CHECK ((id_target_entity IS NULL) = (target_record_id IS NULL))
  `);

  await knex.raw(`
    CREATE INDEX notification_profile_unread_created_idx
      ON notification (id_profile, is_read, date_created DESC)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('notification');
  await knex.raw('DROP FUNCTION IF EXISTS notification_clear_target_record_on_entity_delete()');
}
