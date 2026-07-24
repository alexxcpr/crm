import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  if (
    !(await knex.schema.hasColumn(
      'tenant_storage_reservation',
      'file_version_id',
    ))
  ) {
    await knex.schema.alterTable(
      'tenant_storage_reservation',
      (table) => {
        table.uuid('file_version_id').nullable();
      },
    );
  }

  await knex('tenant_storage_reservation')
    .whereNull('file_version_id')
    .update({
      file_version_id: knex.ref('file_id'),
    });

  await knex.raw(`
    ALTER TABLE tenant_storage_reservation
      ALTER COLUMN file_version_id SET NOT NULL,
      DROP CONSTRAINT IF EXISTS tenant_storage_reservation_file_id_unique
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenant_storage_reservation_file_version_unique
      ON tenant_storage_reservation(file_version_id)
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS tenant_storage_reservation_file_idx
      ON tenant_storage_reservation(tenant_id, file_id)
  `);
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.raw(
    'DROP INDEX IF EXISTS tenant_storage_reservation_file_version_unique',
  );
  await knex.raw(
    'DROP INDEX IF EXISTS tenant_storage_reservation_file_idx',
  );
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenant_storage_reservation_file_id_unique
      ON tenant_storage_reservation(file_id)
  `);
  await knex.schema.alterTable(
    'tenant_storage_reservation',
    (table) => {
      table.dropColumn('file_version_id');
    },
  );
}
