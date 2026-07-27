import type { Knex } from 'knex';

const ACCESS_LEVELS = [
  'platform_owner',
  'tenant_admin',
  'user',
] as const;

const FILE_PURPOSES = [
  'entity_field',
  'workflow_generated',
  'organization_logo',
] as const;

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('profile', (table) => {
      table
        .string('access_level', 30)
        .notNullable()
        .defaultTo('user');
      table.index(
        ['access_level', 'is_active'],
        'profile_access_level_active_idx',
      );
    });

    await trx.raw(`
      ALTER TABLE profile
        ADD CONSTRAINT profile_access_level_check
        CHECK (access_level IN (${ACCESS_LEVELS.map((value) => `'${value}'`).join(', ')}))
    `);

    await trx('profile')
      .whereIn(
        'id_profile',
        trx('profile_role')
          .join(
            'role',
            'profile_role.id_role',
            'role.id_role',
          )
          .where('role.slug', 'admin')
          .select('profile_role.id_profile'),
      )
      .update({ access_level: 'tenant_admin' });
    await trx.raw(`
      CREATE UNIQUE INDEX profile_single_platform_owner_idx
        ON profile (access_level)
        WHERE access_level = 'platform_owner'
    `);

    await trx.schema.alterTable(
      'stored_file',
      (table) => {
        table
          .string('purpose', 40)
          .notNullable()
          .defaultTo('entity_field');
        table.index(
          ['purpose', 'status'],
          'stored_file_purpose_status_idx',
        );
      },
    );

    await trx('stored_file')
      .whereNull('id_field')
      .update({ purpose: 'workflow_generated' });

    await trx.raw(`
      ALTER TABLE stored_file
        ADD CONSTRAINT stored_file_purpose_check
        CHECK (purpose IN (${FILE_PURPOSES.map((value) => `'${value}'`).join(', ')}))
    `);

    await trx.schema.createTable(
      'tenant_configuration',
      (table) => {
        table
          .smallint('id_configuration')
          .primary()
          .defaultTo(1);
        table
          .string('organization_name', 100)
          .nullable();
        table
          .uuid('logo_file_id')
          .nullable()
          .references('id_file')
          .inTable('stored_file')
          .onDelete('SET NULL');
        table
          .string('primary_color', 30)
          .notNullable()
          .defaultTo('violet');
        table
          .string('locale', 35)
          .notNullable()
          .defaultTo('ro-RO');
        table
          .string('timezone', 100)
          .notNullable()
          .defaultTo('Europe/Bucharest');
        table
          .string('date_format', 30)
          .notNullable()
          .defaultTo('dd.MM.yyyy');
        table
          .string('default_currency', 3)
          .notNullable()
          .defaultTo('RON');
        table
          .uuid('updated_by_profile')
          .nullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('SET NULL');
        table
          .timestamp('date_created', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
        table
          .timestamp('date_updated', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());
      },
    );

    await trx.raw(`
      ALTER TABLE tenant_configuration
        ADD CONSTRAINT tenant_configuration_singleton_check
        CHECK (id_configuration = 1)
    `);

    await trx('tenant_configuration').insert({
      id_configuration: 1,
    });

    await trx.schema.createTable(
      'tenant_audit_log',
      (table) => {
        table
          .uuid('id_audit')
          .primary()
          .defaultTo(trx.fn.uuid());
        table
          .uuid('id_actor_profile')
          .nullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('SET NULL');
        table.string('action', 100).notNullable();
        table.string('target_type', 100).notNullable();
        table.string('target_id', 255).nullable();
        table.jsonb('before_value').nullable();
        table.jsonb('after_value').nullable();
        table
          .timestamp('date_created', { useTz: true })
          .notNullable()
          .defaultTo(trx.fn.now());

        table.index(
          ['target_type', 'target_id', 'date_created'],
          'tenant_audit_target_created_idx',
        );
        table.index(
          ['id_actor_profile', 'date_created'],
          'tenant_audit_actor_created_idx',
        );
      },
    );
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.dropTableIfExists(
      'tenant_audit_log',
    );
    await trx.schema.dropTableIfExists(
      'tenant_configuration',
    );

    await trx.raw(`
      ALTER TABLE stored_file
        DROP CONSTRAINT IF EXISTS stored_file_purpose_check
    `);
    await trx.schema.alterTable(
      'stored_file',
      (table) => {
        table.dropIndex(
          ['purpose', 'status'],
          'stored_file_purpose_status_idx',
        );
        table.dropColumn('purpose');
      },
    );

    await trx.raw(`
      ALTER TABLE profile
        DROP CONSTRAINT IF EXISTS profile_access_level_check
    `);
    await trx.raw(
      'DROP INDEX IF EXISTS profile_single_platform_owner_idx',
    );
    await trx.schema.alterTable('profile', (table) => {
      table.dropIndex(
        ['access_level', 'is_active'],
        'profile_access_level_active_idx',
      );
      table.dropColumn('access_level');
    });
  });
}
