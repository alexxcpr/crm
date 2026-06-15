import type { Knex } from 'knex';

const SCOPED_ACTIONS = new Set(['read', 'update', 'delete', 'manage']);

function baseUsername(email: string): string {
  const raw = (email.split('@')[0] || 'user').toLowerCase();
  return raw.replace(/[^a-z0-9._-]/g, '_').slice(0, 80) || 'user';
}

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable('user', (t) => {
      t.string('login_username', 100).nullable();
      t.boolean('must_change_password').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
    });

    await trx.schema.createTable('profile', (t) => {
      t.uuid('id_profile').primary().defaultTo(trx.fn.uuid());
      t.uuid('id_user').notNullable().references('id').inTable('user').onDelete('CASCADE');
      t.string('username', 100).notNullable().unique();
      t.string('email', 255).notNullable().unique();
      t.string('display_name', 200).nullable();
      t.boolean('is_default').notNullable().defaultTo(false);
      t.boolean('is_active').notNullable().defaultTo(true);
      t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(trx.fn.now());
      t.index(['id_user', 'is_active']);
    });

    await trx.schema.createTable('profile_role', (t) => {
      t.uuid('id_profile').notNullable().references('id_profile').inTable('profile').onDelete('CASCADE');
      t.uuid('id_role').notNullable().references('id_role').inTable('role').onDelete('CASCADE');
      t.primary(['id_profile', 'id_role']);
    });

    const users = await trx('user').orderBy('date_created', 'asc');
    const used = new Set<string>();
    for (const user of users) {
      const base = baseUsername(user.email);
      let username = base;
      let suffix = 2;
      while (used.has(username)) username = `${base.slice(0, 75)}-${suffix++}`;
      used.add(username);

      const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ') || null;
      await trx('user').where('id', user.id).update({ login_username: username });
      await trx('profile').insert({
        id_profile: user.id,
        id_user: user.id,
        username,
        email: String(user.email).toLowerCase(),
        display_name: displayName,
        is_default: true,
      });
    }

    await trx.raw('ALTER TABLE "user" ALTER COLUMN "login_username" SET NOT NULL');
    await trx.raw('ALTER TABLE "user" ADD CONSTRAINT "user_login_username_unique" UNIQUE ("login_username")');

    await trx('profile_role').insert(
      trx('user_role').select({ id_profile: 'id_user', id_role: 'id_role' }),
    );

    await trx.schema.alterTable('refresh_token', (t) => {
      t.uuid('profile_id').nullable().references('id_profile').inTable('profile').onDelete('CASCADE');
    });
    await trx('refresh_token').del();
    await trx.raw('ALTER TABLE "refresh_token" ALTER COLUMN "profile_id" SET NOT NULL');

    const entityTables = await trx('entity').select('table_name');
    for (const { table_name: tableName } of entityTables) {
      if (!(await trx.schema.hasTable(tableName))) continue;
      const hasOwner = await trx.schema.hasColumn(tableName, 'id_owner');
      const hasProfile = await trx.schema.hasColumn(tableName, 'id_profile');
      if (hasOwner && !hasProfile) {
        const orphan = await trx(tableName)
          .leftJoin('user', `${tableName}.id_owner`, 'user.id')
          .whereNotNull(`${tableName}.id_owner`)
          .whereNull('user.id')
          .first(`${tableName}.id_owner`);
        if (orphan) throw new Error(`Ownership orfan in ${tableName}: ${orphan.id_owner}`);
        await trx.schema.alterTable(tableName, (t) => t.renameColumn('id_owner', 'id_profile'));
      }
      if (await trx.schema.hasColumn(tableName, 'id_profile')) {
        await trx.schema.alterTable(tableName, (t) => {
          t.index('id_profile', `idx_${tableName}_id_profile`);
          t.foreign('id_profile', `fk_${tableName}_profile`).references('id_profile').inTable('profile').onDelete('RESTRICT');
        });
      }
    }

    await trx.schema.alterTable('role_permission', (t) => {
      t.string('scope', 20).nullable();
    });
    await trx('role_permission').whereIn('action', [...SCOPED_ACTIONS]).update({ scope: 'all' });

    const permissions = await trx('role_permission');
    const entities = await trx('entity').select('id_entity', 'id_module');
    for (const permission of permissions) {
      const targets = permission.id_entity
        ? entities.filter((e) => e.id_entity === permission.id_entity)
        : permission.id_module
          ? entities.filter((e) => e.id_module === permission.id_module)
          : entities;
      for (const entity of targets) {
        await trx('role_permission').insert({
          id_role: permission.id_role,
          id_entity: entity.id_entity,
          action: permission.action,
          scope: SCOPED_ACTIONS.has(permission.action) ? 'all' : null,
        }).onConflict(['id_role', 'id_module', 'id_entity', 'action']).ignore();
      }
    }
    await trx('role_permission').whereNull('id_entity').del();
    await trx.schema.alterTable('role_permission', (t) => {
      t.dropUnique(['id_role', 'id_module', 'id_entity', 'action']);
      t.dropColumn('id_module');
      t.unique(['id_role', 'id_entity', 'action']);
    });

    await trx.schema.dropTable('user_role');
    await trx.schema.alterTable('user', (t) => {
      t.dropUnique(['email']);
      t.dropColumn('email');
      t.dropColumn('first_name');
      t.dropColumn('last_name');
    });
  });
}

export async function down(): Promise<void> {
  throw new Error('Migrarea multi-profile nu poate fi rollback-ata fara pierdere de date. Restaurati backup-ul tenantului.');
}
