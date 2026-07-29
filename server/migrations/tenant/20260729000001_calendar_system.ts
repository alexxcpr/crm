import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  await knex.schema.createTable(
    'ui_calendar',
    (table) => {
      table
        .uuid('id_ui_calendar')
        .primary()
        .defaultTo(knex.fn.uuid());
      table.string('name', 100).notNullable();
      table
        .string('slug', 100)
        .notNullable()
        .unique();
      table.text('description').nullable();
      table.string('icon', 50).nullable();
      table
        .string('default_view', 20)
        .notNullable()
        .defaultTo('month');
      table
        .boolean('allow_day')
        .notNullable()
        .defaultTo(true);
      table
        .boolean('allow_week')
        .notNullable()
        .defaultTo(true);
      table
        .boolean('allow_month')
        .notNullable()
        .defaultTo(true);
      table
        .boolean('allow_list')
        .notNullable()
        .defaultTo(true);
      table
        .string('list_range', 20)
        .notNullable()
        .defaultTo('month');
      table
        .integer('first_day')
        .notNullable()
        .defaultTo(1);
      table
        .boolean('show_weekends')
        .notNullable()
        .defaultTo(true);
      table
        .string('slot_min_time', 5)
        .notNullable()
        .defaultTo('00:00');
      table
        .string('slot_max_time', 5)
        .notNullable()
        .defaultTo('24:00');
      table
        .string('scroll_time', 5)
        .notNullable()
        .defaultTo('08:00');
      table
        .integer('slot_duration_minutes')
        .notNullable()
        .defaultTo(30);
      table
        .integer('rank')
        .notNullable()
        .defaultTo(0);
      table
        .boolean('is_active')
        .notNullable()
        .defaultTo(true);
      table
        .timestamp('date_created', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('date_updated', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
    },
  );

  await knex.raw(`
    ALTER TABLE ui_calendar
      ADD CONSTRAINT ui_calendar_default_view_check
      CHECK (default_view IN ('day', 'week', 'month', 'list')),
      ADD CONSTRAINT ui_calendar_list_range_check
      CHECK (list_range IN ('day', 'week', 'month')),
      ADD CONSTRAINT ui_calendar_first_day_check
      CHECK (first_day BETWEEN 0 AND 6),
      ADD CONSTRAINT ui_calendar_slot_duration_check
      CHECK (slot_duration_minutes IN (5, 10, 15, 30, 60)),
      ADD CONSTRAINT ui_calendar_allowed_view_check
      CHECK (allow_day OR allow_week OR allow_month OR allow_list),
      ADD CONSTRAINT ui_calendar_default_allowed_check
      CHECK (
        (default_view = 'day' AND allow_day)
        OR (default_view = 'week' AND allow_week)
        OR (default_view = 'month' AND allow_month)
        OR (default_view = 'list' AND allow_list)
      )
  `);

  await knex.schema.createTable(
    'ui_calendar_source',
    (table) => {
      table
        .uuid('id_ui_calendar_source')
        .primary()
        .defaultTo(knex.fn.uuid());
      table
        .uuid('id_ui_calendar')
        .notNullable()
        .references('id_ui_calendar')
        .inTable('ui_calendar')
        .onDelete('CASCADE');
      table
        .uuid('id_entity')
        .notNullable()
        .references('id_entity')
        .inTable('entity')
        .onDelete('RESTRICT');
      table.string('name', 100).notNullable();
      table
        .string('color', 7)
        .notNullable()
        .defaultTo('#2563eb');
      table
        .uuid('id_start_field')
        .notNullable()
        .references('id_field')
        .inTable('field')
        .onDelete('RESTRICT');
      table
        .uuid('id_end_field')
        .notNullable()
        .references('id_field')
        .inTable('field')
        .onDelete('RESTRICT');
      table
        .jsonb('title_segments')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"));
      table
        .jsonb('filters')
        .notNullable()
        .defaultTo(knex.raw("'[]'::jsonb"));
      table
        .boolean('allow_create')
        .notNullable()
        .defaultTo(true);
      table
        .boolean('allow_update')
        .notNullable()
        .defaultTo(true);
      table
        .integer('rank')
        .notNullable()
        .defaultTo(0);
      table
        .boolean('is_active')
        .notNullable()
        .defaultTo(true);
      table
        .timestamp('date_created', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('date_updated', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());

      table.index(['id_ui_calendar', 'rank']);
      table.index(['id_entity']);
      table.index(['id_start_field']);
      table.index(['id_end_field']);
    },
  );

  await knex.raw(`
    ALTER TABLE ui_calendar_source
      ADD CONSTRAINT ui_calendar_source_fields_different_check
      CHECK (id_start_field <> id_end_field),
      ADD CONSTRAINT ui_calendar_source_color_check
      CHECK (color ~ '^#[0-9A-Fa-f]{6}$')
  `);

  await knex.schema.createTable(
    'ui_calendar_source_popover_field',
    (table) => {
      table
        .uuid('id_ui_calendar_source')
        .notNullable()
        .references('id_ui_calendar_source')
        .inTable('ui_calendar_source')
        .onDelete('CASCADE');
      table
        .uuid('id_field')
        .notNullable()
        .references('id_field')
        .inTable('field')
        .onDelete('RESTRICT');
      table
        .integer('rank')
        .notNullable()
        .defaultTo(0);
      table.primary([
        'id_ui_calendar_source',
        'id_field',
      ]);
      table.index([
        'id_ui_calendar_source',
        'rank',
      ]);
    },
  );

  await knex.schema.alterTable(
    'menu_item',
    (table) => {
      table
        .uuid('id_ui_calendar')
        .nullable()
        .references('id_ui_calendar')
        .inTable('ui_calendar')
        .onDelete('SET NULL');
      table.index(['id_ui_calendar']);
    },
  );
}

export async function down(
  knex: Knex,
): Promise<void> {
  if (
    await knex.schema.hasColumn(
      'menu_item',
      'id_ui_calendar',
    )
  ) {
    await knex.schema.alterTable(
      'menu_item',
      (table) => {
        table.dropColumn('id_ui_calendar');
      },
    );
  }
  await knex.schema.dropTableIfExists(
    'ui_calendar_source_popover_field',
  );
  await knex.schema.dropTableIfExists(
    'ui_calendar_source',
  );
  await knex.schema.dropTableIfExists(
    'ui_calendar',
  );
}
