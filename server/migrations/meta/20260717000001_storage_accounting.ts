import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  if (
    !(await knex.schema.hasTable(
      'tenant_storage_usage',
    ))
  ) {
    await knex.schema.createTable(
      'tenant_storage_usage',
      (t) => {
        t.uuid('tenant_id')
          .primary()
          .references('id')
          .inTable('tenants')
          .onDelete('CASCADE');
        t.bigInteger('used_bytes')
          .notNullable()
          .defaultTo(0);
        t.bigInteger('reserved_bytes')
          .notNullable()
          .defaultTo(0);
        t.timestamp('updated_at', { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now());
      },
    );

    await knex.raw(`
      ALTER TABLE tenant_storage_usage
        ADD CONSTRAINT tenant_storage_usage_non_negative_check
        CHECK (used_bytes >= 0 AND reserved_bytes >= 0)
    `);
  }

  if (
    !(await knex.schema.hasTable(
      'tenant_storage_reservation',
    ))
  ) {
    await knex.schema.createTable(
      'tenant_storage_reservation',
      (t) => {
        t.uuid('id_reservation')
          .primary()
          .defaultTo(knex.fn.uuid());
        t.uuid('tenant_id')
          .notNullable()
          .references('id')
          .inTable('tenants')
          .onDelete('CASCADE');
        t.uuid('file_id').notNullable().unique();
        t.uuid('owner_profile_id').notNullable();
        t.uuid('idempotency_key').notNullable();
        t.text('temporary_object_key')
          .notNullable()
          .unique();
        t.text('final_object_key')
          .notNullable()
          .unique();
        t.bigInteger(
          'expected_bytes',
        ).notNullable();
        t.string('status', 30)
          .notNullable()
          .defaultTo('pending');
        t.string('error_code', 100).nullable();
        t.timestamp('expires_at', {
          useTz: true,
        }).notNullable();
        t.timestamp('completed_at', {
          useTz: true,
        }).nullable();
        t.timestamp('deleted_at', {
          useTz: true,
        }).nullable();
        t.timestamp('created_at', { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now());
        t.timestamp('updated_at', { useTz: true })
          .notNullable()
          .defaultTo(knex.fn.now());

        t.unique([
          'tenant_id',
          'idempotency_key',
        ]);
        t.index(
          ['tenant_id', 'status'],
          'tenant_storage_reservation_tenant_status_idx',
        );
        t.index(
          ['status', 'expires_at'],
          'tenant_storage_reservation_expiry_idx',
        );
      },
    );

    await knex.raw(`
      ALTER TABLE tenant_storage_reservation
        ADD CONSTRAINT tenant_storage_reservation_size_check CHECK (expected_bytes > 0),
        ADD CONSTRAINT tenant_storage_reservation_status_check
        CHECK (status IN ('pending', 'finalizing', 'completed', 'expired', 'failed', 'deleted'))
    `);
  }

  await knex('tenant_storage_usage')
    .insert(
      knex('tenants').select({ tenant_id: 'id' }),
    )
    .onConflict('tenant_id')
    .ignore();
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.schema.dropTableIfExists(
    'tenant_storage_reservation',
  );
  await knex.schema.dropTableIfExists(
    'tenant_storage_usage',
  );
}
