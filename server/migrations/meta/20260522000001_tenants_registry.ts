import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('tenants', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('slug', 100).notNullable().unique();
    t.string('db_name', 100).notNullable().unique();
    t.string('db_user', 100).nullable();
    t.text('db_password_encrypted').nullable();
    t.string('plan', 50).notNullable().defaultTo('starter');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('max_users').notNullable().defaultTo(100);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenants');
}
