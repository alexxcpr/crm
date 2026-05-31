import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('refresh_token', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.string('jti', 255).notNullable().unique();
    t.uuid('user_id').notNullable().references('id').inTable('user').onDelete('CASCADE');
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.boolean('is_revoked').notNullable().defaultTo(false);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('refresh_token');
}
