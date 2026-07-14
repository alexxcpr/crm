import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('ui_dashboard', (t) => {
    t.uuid('id_ui_dashboard').primary().defaultTo(knex.fn.uuid());
    t.string('name', 100).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.text('description').nullable();
    t.string('icon', 50).nullable();
    t.string('default_date_preset', 50).notNullable().defaultTo('last_30_days');
    t.boolean('is_default').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('rank').notNullable().defaultTo(0);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX ui_dashboard_one_active_default
      ON ui_dashboard (is_default)
      WHERE is_default = true AND is_active = true
  `);

  await knex.schema.createTable('ui_block', (t) => {
    t.uuid('id_ui_block').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_ui_dashboard').notNullable()
      .references('id_ui_dashboard').inTable('ui_dashboard').onDelete('CASCADE');
    t.string('title', 150).notNullable();
    t.string('subtitle', 300).nullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['id_ui_dashboard', 'rank']);
  });

  await knex.schema.createTable('ui_widget', (t) => {
    t.uuid('id_ui_widget').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_ui_block').notNullable()
      .references('id_ui_block').inTable('ui_block').onDelete('CASCADE');
    t.uuid('id_entity').notNullable()
      .references('id_entity').inTable('entity').onDelete('RESTRICT');
    t.string('widget_type', 20).notNullable();
    t.string('chart_type', 20).nullable();
    t.string('title', 150).notNullable();
    t.string('subtitle', 300).nullable();
    t.string('icon', 50).nullable();
    t.string('aggregation', 20).notNullable().defaultTo('count');
    t.uuid('id_value_field').nullable()
      .references('id_field').inTable('field').onDelete('RESTRICT');
    t.string('group_mode', 20).nullable();
    t.uuid('id_group_field').nullable()
      .references('id_field').inTable('field').onDelete('RESTRICT');
    t.uuid('id_series_field').nullable()
      .references('id_field').inTable('field').onDelete('RESTRICT');
    t.string('date_source', 20).nullable();
    t.uuid('id_date_field').nullable()
      .references('id_field').inTable('field').onDelete('RESTRICT');
    t.string('date_granularity', 20).notNullable().defaultTo('auto');
    t.jsonb('filters').notNullable().defaultTo(knex.raw("'[]'::jsonb"));
    t.boolean('comparison_enabled').notNullable().defaultTo(false);
    t.string('value_format', 20).notNullable().defaultTo('auto');
    t.string('currency_code', 3).notNullable().defaultTo('RON');
    t.integer('top_n').notNullable().defaultTo(12);
    t.integer('col_span').notNullable().defaultTo(4);
    t.integer('rank').notNullable().defaultTo(0);
    t.boolean('drilldown_enabled').notNullable().defaultTo(true);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    t.index(['id_ui_block', 'rank']);
    t.index(['id_entity']);
  });

  await knex.schema.alterTable('menu_item', (t) => {
    t.uuid('id_ui_dashboard').nullable()
      .references('id_ui_dashboard').inTable('ui_dashboard').onDelete('SET NULL');
    t.index(['id_ui_dashboard']);
  });

  await knex('ui_dashboard').insert({
    name: 'Acasa',
    slug: 'acasa',
    description: 'Dashboard-ul principal al aplicatiei.',
    icon: 'i-lucide-layout-dashboard',
    default_date_preset: 'last_30_days',
    is_default: true,
    is_active: true,
    rank: 0,
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('menu_item', (t) => {
    t.dropColumn('id_ui_dashboard');
  });
  await knex.schema.dropTableIfExists('ui_widget');
  await knex.schema.dropTableIfExists('ui_block');
  await knex.schema.dropTableIfExists('ui_dashboard');
}
