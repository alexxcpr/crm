import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── user ──
  await knex.schema.createTable('user', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.string('email', 255).notNullable().unique();
    t.string('hash', 255).notNullable();
    t.string('first_name', 100).nullable();
    t.string('last_name', 100).nullable();
  });

  // ── role ──
  await knex.schema.createTable('role', (t) => {
    t.uuid('id_role').primary().defaultTo(knex.fn.uuid());
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.text('description').nullable();
    t.boolean('is_system').notNullable().defaultTo(false);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── user_role (composite PK) ──
  await knex.schema.createTable('user_role', (t) => {
    t.uuid('id_user').notNullable().references('id').inTable('user').onDelete('CASCADE');
    t.uuid('id_role').notNullable().references('id_role').inTable('role').onDelete('CASCADE');
    t.primary(['id_user', 'id_role']);
  });

  // ── module ──
  await knex.schema.createTable('module', (t) => {
    t.uuid('id_module').primary().defaultTo(knex.fn.uuid());
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.string('icon', 50).nullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── entity ──
  await knex.schema.createTable('entity', (t) => {
    t.uuid('id_entity').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_module').nullable().references('id_module').inTable('module').onDelete('SET NULL');
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.string('table_name', 100).notNullable().unique();
    t.string('icon', 50).nullable();
    t.boolean('is_system').notNullable().defaultTo(false);
    t.string('label_singular', 100).nullable();
    t.string('label_plural', 100).nullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── ui_tab ──
  await knex.schema.createTable('ui_tab', (t) => {
    t.uuid('id_ui_tab').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_entity').notNullable().references('id_entity').inTable('entity').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.boolean('is_system').notNullable().defaultTo(false);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['id_entity', 'slug']);
  });

  // ── field ──
  await knex.schema.createTable('field', (t) => {
    t.uuid('id_field').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_entity').notNullable().references('id_entity').inTable('entity').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable();
    t.string('column_name', 100).notNullable();
    t.string('data_type', 50).notNullable();
    t.string('ui_type', 50).notNullable();
    t.text('default_value').nullable();
    t.string('placeholder', 255).nullable();
    t.string('help_text', 500).nullable();
    t.jsonb('options').nullable();
    t.boolean('is_required').notNullable().defaultTo(false);
    t.boolean('is_unique').notNullable().defaultTo(false);
    t.boolean('is_filterable').notNullable().defaultTo(false);
    t.boolean('is_sortable').notNullable().defaultTo(true);
    t.boolean('visible_in_table').notNullable().defaultTo(true);
    t.boolean('visible_in_form').notNullable().defaultTo(true);
    t.boolean('is_readonly').notNullable().defaultTo(false);
    t.boolean('is_system').notNullable().defaultTo(false);
    t.jsonb('validation_rules').nullable();
    t.uuid('id_relation_entity').nullable().references('id_entity').inTable('entity').onDelete('SET NULL');
    t.string('relation_display_field', 100).nullable();
    t.uuid('id_ui_tab').nullable().references('id_ui_tab').inTable('ui_tab').onDelete('RESTRICT');
    t.integer('rank').notNullable().defaultTo(1);
    t.integer('grid_col').notNullable().defaultTo(1);
    t.integer('col_span').notNullable().defaultTo(1);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.unique(['id_entity', 'slug']);
    t.unique(['id_entity', 'column_name']);
  });

  // ── role_permission ──
  await knex.schema.createTable('role_permission', (t) => {
    t.uuid('id_permission').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_role').notNullable().references('id_role').inTable('role').onDelete('CASCADE');
    t.uuid('id_module').nullable().references('id_module').inTable('module').onDelete('CASCADE');
    t.uuid('id_entity').nullable().references('id_entity').inTable('entity').onDelete('CASCADE');
    t.string('action', 50).notNullable();
    t.unique(['id_role', 'id_module', 'id_entity', 'action']);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('role_permission');
  await knex.schema.dropTableIfExists('field');
  await knex.schema.dropTableIfExists('ui_tab');
  await knex.schema.dropTableIfExists('entity');
  await knex.schema.dropTableIfExists('module');
  await knex.schema.dropTableIfExists('user_role');
  await knex.schema.dropTableIfExists('role');
  await knex.schema.dropTableIfExists('user');
}
