import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  if (await knex.schema.hasTable('stored_file'))
    return;

  await knex.schema.createTable(
    'stored_file',
    (t) => {
      t.uuid('id_file')
        .primary()
        .defaultTo(knex.fn.uuid());
      t.uuid('reservation_id')
        .notNullable()
        .unique();
      t.string('storage_provider', 30)
        .notNullable()
        .defaultTo('s3');
      t.string('bucket', 255).notNullable();
      t.text('object_key').notNullable().unique();
      t.string(
        'original_name',
        255,
      ).notNullable();
      t.string('mime_type', 255).notNullable();
      t.bigInteger('size_bytes').notNullable();
      t.string('checksum', 255).nullable();
      t.string('etag', 255).nullable();
      t.string('status', 30)
        .notNullable()
        .defaultTo('pending');
      t.uuid('id_entity')
        .notNullable()
        .references('id_entity')
        .inTable('entity')
        .onDelete('RESTRICT');
      t.uuid('id_field')
        .notNullable()
        .references('id_field')
        .inTable('field')
        .onDelete('RESTRICT');
      t.uuid('record_id').nullable();
      t.uuid('id_owner_profile')
        .notNullable()
        .references('id_profile')
        .inTable('profile')
        .onDelete('RESTRICT');
      t.timestamp('date_created', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      t.timestamp('date_updated', { useTz: true })
        .notNullable()
        .defaultTo(knex.fn.now());
      t.timestamp('date_deleted', {
        useTz: true,
      }).nullable();

      t.index(
        ['id_entity', 'record_id'],
        'stored_file_entity_record_idx',
      );
      t.index(
        ['id_owner_profile', 'status'],
        'stored_file_owner_status_idx',
      );
      t.index(
        ['status', 'date_updated'],
        'stored_file_status_updated_idx',
      );
    },
  );

  await knex.raw(`
    ALTER TABLE stored_file
      ADD CONSTRAINT stored_file_size_check CHECK (size_bytes > 0),
      ADD CONSTRAINT stored_file_status_check
      CHECK (status IN ('pending', 'scanning', 'active', 'deleting', 'deleted', 'rejected', 'failed'))
  `);
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.schema.dropTableIfExists(
    'stored_file',
  );
}
