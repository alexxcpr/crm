import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  const hasCurrentVersionId =
    await knex.schema.hasColumn(
      'stored_file',
      'current_version_id',
    );

  if (!hasCurrentVersionId) {
    await knex.schema.alterTable(
      'stored_file',
      (table) => {
        table
          .uuid('current_version_id')
          .nullable();
        table
          .integer('current_version_number')
          .notNullable()
          .defaultTo(1);
      },
    );
  }

  await knex.raw(`
    ALTER TABLE stored_file
      ALTER COLUMN id_entity DROP NOT NULL,
      ALTER COLUMN id_field DROP NOT NULL
  `);

  if (
    !(await knex.schema.hasTable(
      'stored_file_version',
    ))
  ) {
    await knex.schema.createTable(
      'stored_file_version',
      (table) => {
        table
          .uuid('id_file_version')
          .primary()
          .defaultTo(knex.fn.uuid());
        table
          .uuid('id_file')
          .notNullable()
          .references('id_file')
          .inTable('stored_file')
          .onDelete('CASCADE');
        table
          .integer('version_number')
          .notNullable();
        table
          .uuid('reservation_id')
          .notNullable()
          .unique();
        table
          .string('storage_provider', 30)
          .notNullable()
          .defaultTo('s3');
        table.string('bucket', 255).notNullable();
        table
          .text('object_key')
          .notNullable()
          .unique();
        table
          .string('file_name', 255)
          .notNullable();
        table
          .string('mime_type', 255)
          .notNullable();
        table
          .bigInteger('size_bytes')
          .notNullable();
        table.string('checksum', 255).nullable();
        table.string('etag', 255).nullable();
        table
          .string('status', 30)
          .notNullable()
          .defaultTo('pending');
        table
          .uuid('id_creator_profile')
          .notNullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('RESTRICT');
        table
          .timestamp('date_created', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(knex.fn.now());
        table
          .timestamp('date_deleted', {
            useTz: true,
          })
          .nullable();

        table.unique([
          'id_file',
          'version_number',
        ]);
        table.index(
          ['id_file', 'status'],
          'stored_file_version_file_status_idx',
        );
      },
    );

    await knex.raw(`
      ALTER TABLE stored_file_version
        ADD CONSTRAINT stored_file_version_number_check CHECK (version_number > 0),
        ADD CONSTRAINT stored_file_version_size_check CHECK (size_bytes > 0),
        ADD CONSTRAINT stored_file_version_status_check
          CHECK (status IN ('pending', 'scanning', 'active', 'deleting', 'deleted', 'rejected', 'failed'))
    `);
  }

  await knex.raw(`
    INSERT INTO stored_file_version (
      id_file_version,
      id_file,
      version_number,
      reservation_id,
      storage_provider,
      bucket,
      object_key,
      file_name,
      mime_type,
      size_bytes,
      checksum,
      etag,
      status,
      id_creator_profile,
      date_created,
      date_deleted
    )
    SELECT
      sf.id_file,
      sf.id_file,
      1,
      sf.reservation_id,
      sf.storage_provider,
      sf.bucket,
      sf.object_key,
      sf.original_name,
      sf.mime_type,
      sf.size_bytes,
      sf.checksum,
      sf.etag,
      sf.status,
      sf.id_owner_profile,
      sf.date_created,
      sf.date_deleted
    FROM stored_file sf
    ON CONFLICT (id_file_version) DO NOTHING
  `);

  await knex('stored_file')
    .whereNull('current_version_id')
    .update({
      current_version_id: knex.ref('id_file'),
      current_version_number: 1,
    });

  await knex.raw(`
    ALTER TABLE stored_file
      ALTER COLUMN current_version_id SET NOT NULL,
      ADD CONSTRAINT stored_file_current_version_fk
        FOREIGN KEY (current_version_id)
        REFERENCES stored_file_version(id_file_version)
        DEFERRABLE INITIALLY DEFERRED
  `);

  if (
    !(await knex.schema.hasTable(
      'workflow_document_session',
    ))
  ) {
    await knex.schema.createTable(
      'workflow_document_session',
      (table) => {
        table
          .uuid('id_session')
          .primary()
          .defaultTo(knex.fn.uuid());
        table
          .string('execution_id', 255)
          .notNullable();
        table.string('package', 30).notNullable();
        table
          .integer('current_revision')
          .notNullable()
          .defaultTo(0);
        table
          .text('current_object_key')
          .notNullable();
        table
          .string('mime_type', 255)
          .notNullable();
        table
          .string('file_name', 255)
          .notNullable();
        table
          .uuid('source_file_id')
          .nullable()
          .references('id_file')
          .inTable('stored_file')
          .onDelete('SET NULL');
        table
          .uuid('id_owner_profile')
          .notNullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('CASCADE');
        table
          .string('status', 30)
          .notNullable()
          .defaultTo('active');
        table
          .timestamp('expires_at', {
            useTz: true,
          })
          .notNullable();
        table
          .timestamp('date_created', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(knex.fn.now());
        table
          .timestamp('date_updated', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(knex.fn.now());

        table.index(
          ['execution_id', 'id_owner_profile'],
          'workflow_document_session_execution_owner_idx',
        );
        table.index(
          ['status', 'expires_at'],
          'workflow_document_session_expiry_idx',
        );
      },
    );

    await knex.raw(`
      ALTER TABLE workflow_document_session
        ADD CONSTRAINT workflow_document_session_revision_check CHECK (current_revision >= 0),
        ADD CONSTRAINT workflow_document_session_package_check
          CHECK (package IN ('word', 'pdf', 'excel', 'image')),
        ADD CONSTRAINT workflow_document_session_status_check
          CHECK (status IN ('active', 'expired', 'deleted'))
    `);
  }

  if (
    !(await knex.schema.hasTable(
      'workflow_document_operation',
    ))
  ) {
    await knex.schema.createTable(
      'workflow_document_operation',
      (table) => {
        table
          .uuid('id_operation')
          .primary()
          .defaultTo(knex.fn.uuid());
        table
          .uuid('id_session')
          .notNullable()
          .references('id_session')
          .inTable('workflow_document_session')
          .onDelete('CASCADE');
        table
          .string('execution_id', 255)
          .notNullable();
        table
          .uuid('id_owner_profile')
          .notNullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('CASCADE');
        table
          .string('idempotency_key', 500)
          .notNullable();
        table
          .string('operation', 100)
          .notNullable();
        table
          .integer('input_revision')
          .nullable();
        table
          .integer('output_revision')
          .nullable();
        table.jsonb('response').nullable();
        table
          .string('status', 30)
          .notNullable()
          .defaultTo('running');
        table
          .timestamp('date_created', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(knex.fn.now());
        table
          .timestamp('date_completed', {
            useTz: true,
          })
          .nullable();

        table.unique([
          'id_session',
          'idempotency_key',
        ]);
        table.unique(
          [
            'execution_id',
            'id_owner_profile',
            'idempotency_key',
          ],
          {
            indexName:
              'workflow_document_operation_execution_idempotency_unique',
          },
        );
        table.index(
          ['id_session', 'date_created'],
          'workflow_document_operation_session_idx',
        );
      },
    );

    await knex.raw(`
      ALTER TABLE workflow_document_operation
        ADD CONSTRAINT workflow_document_operation_status_check
          CHECK (status IN ('running', 'completed', 'failed'))
    `);
  }
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.schema.dropTableIfExists(
    'workflow_document_operation',
  );
  await knex.schema.dropTableIfExists(
    'workflow_document_session',
  );
  await knex.raw(
    'ALTER TABLE stored_file DROP CONSTRAINT IF EXISTS stored_file_current_version_fk',
  );
  await knex.schema.alterTable(
    'stored_file',
    (table) => {
      table.dropColumn('current_version_id');
      table.dropColumn('current_version_number');
    },
  );
  await knex.schema.dropTableIfExists(
    'stored_file_version',
  );
}
