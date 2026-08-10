import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('integration_token', (table) => {
    table
      .uuid('id_integration_token')
      .primary()
      .defaultTo(knex.fn.uuid());
    table
      .uuid('id_profile')
      .notNullable()
      .references('id_profile')
      .inTable('profile')
      .onDelete('CASCADE');
    table.string('name', 100).notNullable();
    table.string('token_prefix', 32).notNullable().unique();
    table.text('secret_hash').notNullable();
    table.jsonb('scopes').notNullable().defaultTo('[]');
    table.timestamp('expires_at', { useTz: true }).nullable();
    table.timestamp('revoked_at', { useTz: true }).nullable();
    table.timestamp('last_used_at', { useTz: true }).nullable();
    table
      .timestamp('date_created', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table
      .timestamp('date_updated', { useTz: true })
      .notNullable()
      .defaultTo(knex.fn.now());
    table.index(['id_profile', 'revoked_at']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('integration_token');
}
