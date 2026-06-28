import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('role_group', (t) => {
    t.uuid('id_role_group').primary().defaultTo(knex.fn.uuid());
    t.string('name', 120).notNullable().unique();
    t.text('description').nullable();
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('role_group_role', (t) => {
    t.uuid('id_role_group').notNullable().references('id_role_group').inTable('role_group').onDelete('CASCADE');
    t.uuid('id_role').notNullable().references('id_role').inTable('role').onDelete('CASCADE');
    t.primary(['id_role_group', 'id_role']);
  });

  await knex.schema.createTable('role_group_profile', (t) => {
    t.uuid('id_role_group').notNullable().references('id_role_group').inTable('role_group').onDelete('CASCADE');
    t.uuid('id_profile').notNullable().references('id_profile').inTable('profile').onDelete('CASCADE');
    t.primary(['id_role_group', 'id_profile']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('role_group_profile');
  await knex.schema.dropTableIfExists('role_group_role');
  await knex.schema.dropTableIfExists('role_group');
}
