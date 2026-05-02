import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('workflow_definition', (t) => {
    t.uuid('id_workflow').primary().defaultTo(knex.fn.uuid());
    t.string('name', 200).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.jsonb('nodes').notNullable().defaultTo('[]');
    t.jsonb('connections').notNullable().defaultTo('[]');
    t.string('n8n_workflow_id', 100).nullable();
    t.string('status', 20).notNullable().defaultTo('draft');
    t.integer('version').notNullable().defaultTo(1);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('action_definition', (t) => {
    t.uuid('id_action').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_entity')
      .notNullable()
      .references('id_entity')
      .inTable('entity')
      .onDelete('CASCADE');
    t.string('name', 200).notNullable();
    t.string('slug', 100).notNullable().unique();
    t.boolean('show_in_ui').notNullable().defaultTo(true);
    t.jsonb('trigger_events').notNullable().defaultTo('[]');
    t.jsonb('trigger_conditions').nullable();
    t.uuid('id_workflow')
      .nullable()
      .references('id_workflow')
      .inTable('workflow_definition')
      .onDelete('SET NULL');
    t.jsonb('config').notNullable().defaultTo('{}');
    t.boolean('is_active').notNullable().defaultTo(true);
    t.integer('rank').notNullable().defaultTo(0);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('action_definition');
  await knex.schema.dropTableIfExists('workflow_definition');
}
