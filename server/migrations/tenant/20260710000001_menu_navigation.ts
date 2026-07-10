import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('menu', (t) => {
    t.uuid('id_menu').primary().defaultTo(knex.fn.uuid());
    t.string('name', 100).notNullable();
    t.string('icon', 50).nullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('menu_item', (t) => {
    t.uuid('id_menu_item').primary().defaultTo(knex.fn.uuid());
    t.uuid('id_menu').notNullable().references('id_menu').inTable('menu').onDelete('CASCADE');
    t.string('name', 100).notNullable();
    t.string('icon', 50).nullable();
    t.integer('rank').notNullable().defaultTo(0);
    t.string('open_link', 500).notNullable();
    t.string('link_type', 50).notNullable().defaultTo('internal_route');
    t.uuid('id_entity').nullable().references('id_entity').inTable('entity').onDelete('SET NULL');
    t.uuid('record_id').nullable();
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('date_created', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('date_updated', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.alterTable('menu_item', (t) => {
    t.index(['id_menu', 'rank']);
    t.index(['id_entity']);
  });

  const [{ count }] = await knex('menu').count('* as count');
  if (Number(count) > 0) return;

  const modules = await knex('module').orderBy('rank', 'asc');
  for (const mod of modules) {
    const [menu] = await knex('menu')
      .insert({
        name: mod.name,
        icon: mod.icon,
        rank: mod.rank ?? 0,
        is_active: true,
      })
      .returning(['id_menu']);

    const entities = await knex('entity')
      .where('id_module', mod.id_module)
      .orderBy('rank', 'asc');

    for (const entity of entities) {
      await knex('menu_item').insert({
        id_menu: menu.id_menu,
        name: entity.label_plural ?? entity.name,
        icon: entity.icon,
        rank: entity.rank ?? 0,
        open_link: `/${entity.slug}`,
        link_type: 'entity_list',
        id_entity: entity.id_entity,
        is_active: true,
      });
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('menu_item');
  await knex.schema.dropTableIfExists('menu');
}
