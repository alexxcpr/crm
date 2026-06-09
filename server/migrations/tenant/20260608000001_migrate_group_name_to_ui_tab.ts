import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create ui_tab table
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

  // 2. Migrate existing group_name data into ui_tab rows
  // Get distinct (id_entity, group_name) pairs
  const distinctGroups = await knex('field')
    .select('id_entity', 'group_name')
    .groupBy('id_entity', 'group_name')
    .orderBy('id_entity')
    .orderBy('group_name');

  // Build a map: entityId -> { groupName -> rank }
  // We'll assign rank 0 to 'general', then increment for others alphabetically
  const entityGroupRanks = new Map<string, Map<string, number>>();

  for (const row of distinctGroups) {
    const entityId = row.id_entity as string;
    const groupName = row.group_name as string;
    const normalized = groupName.trim().toLowerCase();

    if (!entityGroupRanks.has(entityId)) {
      entityGroupRanks.set(entityId, new Map());
    }
    // Will assign ranks after collecting all groups per entity
  }

  // Collect all groups per entity and assign ranks
  for (const [entityId, groupMap] of entityGroupRanks.entries()) {
    const groupsForEntity = distinctGroups.filter(
      (r) => r.id_entity === entityId
    );
    // Sort: 'general' first (rank 0), then alphabetically
    const sorted = groupsForEntity.sort((a, b) => {
      const ga = (a.group_name as string).trim().toLowerCase();
      const gb = (b.group_name as string).trim().toLowerCase();
      if (ga === 'general') return -1;
      if (gb === 'general') return 1;
      return ga.localeCompare(gb);
    });

    sorted.forEach((row, index) => {
      const gn = (row.group_name as string).trim().toLowerCase();
      groupMap.set(gn, index);
    });
  }

  // Insert ui_tab rows
  for (const row of distinctGroups) {
    const entityId = row.id_entity as string;
    const groupName = row.group_name as string;
    const normalized = groupName.trim().toLowerCase();
    const rank = entityGroupRanks.get(entityId)?.get(normalized) ?? 0;

    // Format name: replace underscores with spaces, title case each word
    const name = normalized
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (l) => l.toUpperCase());

    await knex('ui_tab').insert({
      id_entity: entityId,
      name,
      slug: normalized,
      rank,
      is_system: normalized === 'general',
    });
  }

  // 3. Add id_ui_tab FK column to field
  await knex.schema.alterTable('field', (t) => {
    t.uuid('id_ui_tab').nullable().references('id_ui_tab').inTable('ui_tab').onDelete('RESTRICT');
  });

  // 4. Backfill field.id_ui_tab from ui_tab by matching slug = normalized group_name
  // Use raw SQL for the JOIN UPDATE (Knex doesn't have a clean cross-table UPDATE with JOIN)
  await knex.raw(`
    UPDATE field
    SET id_ui_tab = ui_tab.id_ui_tab
    FROM ui_tab
    WHERE field.group_name = ui_tab.slug
      AND field.id_entity = ui_tab.id_entity
  `);

  // 5. Drop group_name column
  await knex.schema.alterTable('field', (t) => {
    t.dropColumn('group_name');
  });
}

export async function down(knex: Knex): Promise<void> {
  // 1. Add group_name back
  await knex.schema.alterTable('field', (t) => {
    t.string('group_name', 100).notNullable().defaultTo('general');
  });

  // 2. Backfill group_name from ui_tab.slug
  await knex.raw(`
    UPDATE field
    SET group_name = ui_tab.slug
    FROM ui_tab
    WHERE field.id_ui_tab = ui_tab.id_ui_tab
  `);

  // 3. Drop id_ui_tab column
  await knex.schema.alterTable('field', (t) => {
    t.dropColumn('id_ui_tab');
  });

  // 4. Drop ui_tab table
  await knex.schema.dropTableIfExists('ui_tab');
}
