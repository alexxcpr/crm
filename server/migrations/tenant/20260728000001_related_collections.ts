/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { Knex } from 'knex';

const IDENTIFIER_RE = /^[a-z][a-z0-9_]{1,62}$/;

function relationIndexName(
  tableName: string,
  columnName: string,
): string {
  const base = `idx_${tableName}_${columnName}_relation`;
  if (base.length <= 63) return base;
  let hash = 0;
  for (
    let index = 0;
    index < base.length;
    index++
  ) {
    hash =
      (hash * 31 + base.charCodeAt(index)) >>> 0;
  }
  return `${base.slice(0, 54)}_${hash.toString(16).padStart(8, '0')}`;
}

async function forEachRelationField(
  knex: Knex,
  callback: (
    tableName: string,
    columnName: string,
  ) => Promise<void>,
): Promise<void> {
  const rows = await knex('field as field')
    .join(
      'entity as entity',
      'entity.id_entity',
      'field.id_entity',
    )
    .where('field.ui_type', 'relation')
    .select(
      'entity.table_name',
      'field.column_name',
    );

  for (const row of rows) {
    const tableName = String(row.table_name);
    const columnName = String(row.column_name);
    if (
      !IDENTIFIER_RE.test(tableName) ||
      !IDENTIFIER_RE.test(columnName)
    ) {
      throw new Error(
        `Identificator invalid pentru indexul relatiei: ${tableName}.${columnName}`,
      );
    }
    if (
      !(await knex.schema.hasTable(tableName)) ||
      !(await knex.schema.hasColumn(
        tableName,
        columnName,
      ))
    ) {
      continue;
    }
    await callback(tableName, columnName);
  }
}

export async function up(
  knex: Knex,
): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable(
      'field',
      (table) => {
        table
          .string('relation_kind', 20)
          .nullable();
      },
    );
    await trx('field')
      .where('ui_type', 'relation')
      .update({ relation_kind: 'reference' });
    await trx.raw(`
      ALTER TABLE field
        ADD CONSTRAINT field_relation_kind_check
        CHECK (
          (ui_type = 'relation' AND relation_kind IN ('reference', 'composition'))
          OR
          (ui_type <> 'relation' AND relation_kind IS NULL)
        )
    `);

    await trx.schema.alterTable(
      'ui_tab',
      (table) => {
        table
          .string('content_type', 30)
          .notNullable()
          .defaultTo('fields');
      },
    );
    await trx.raw(`
      ALTER TABLE ui_tab
        ADD CONSTRAINT ui_tab_content_type_check
        CHECK (content_type IN ('fields', 'related_collection'))
    `);

    await trx.schema.createTable(
      'related_collection_definition',
      (table) => {
        table
          .uuid('id_related_collection')
          .primary()
          .defaultTo(trx.fn.uuid());
        table
          .uuid('id_ui_tab')
          .notNullable()
          .unique()
          .references('id_ui_tab')
          .inTable('ui_tab')
          .onDelete('CASCADE');
        table
          .uuid('id_relation_field')
          .notNullable()
          .references('id_field')
          .inTable('field')
          .onDelete('RESTRICT');
        table
          .string('default_view', 20)
          .notNullable()
          .defaultTo('table');
        table
          .boolean('allow_table')
          .notNullable()
          .defaultTo(true);
        table
          .boolean('allow_cards')
          .notNullable()
          .defaultTo(false);
        table
          .uuid('card_title_field_id')
          .nullable()
          .references('id_field')
          .inTable('field')
          .onDelete('RESTRICT');
        table
          .integer('page_size')
          .notNullable()
          .defaultTo(10);
        table
          .string('default_sort', 255)
          .notNullable()
          .defaultTo('-date_created');
        table
          .boolean('allow_create')
          .notNullable()
          .defaultTo(true);
        table
          .boolean('allow_update')
          .notNullable()
          .defaultTo(true);
        table
          .boolean('allow_delete')
          .notNullable()
          .defaultTo(true);
        table
          .string('quick_add_mode', 30)
          .notNullable()
          .defaultTo('none');
        table
          .uuid('id_quick_add_file_field')
          .nullable()
          .references('id_field')
          .inTable('field')
          .onDelete('RESTRICT');
        table
          .timestamp('date_created', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(trx.fn.now());
        table
          .timestamp('date_updated', {
            useTz: true,
          })
          .notNullable()
          .defaultTo(trx.fn.now());

        table.index(
          ['id_relation_field'],
          'related_collection_relation_field_idx',
        );
      },
    );
    await trx.raw(`
      ALTER TABLE related_collection_definition
        ADD CONSTRAINT related_collection_view_check
          CHECK (default_view IN ('table', 'cards')),
        ADD CONSTRAINT related_collection_allowed_view_check
          CHECK (
            (allow_table OR allow_cards)
            AND (default_view <> 'table' OR allow_table)
            AND (default_view <> 'cards' OR allow_cards)
          ),
        ADD CONSTRAINT related_collection_page_size_check
          CHECK (page_size BETWEEN 1 AND 100),
        ADD CONSTRAINT related_collection_quick_add_check
          CHECK (
            (quick_add_mode = 'none' AND id_quick_add_file_field IS NULL)
            OR
            (quick_add_mode = 'multi_file' AND id_quick_add_file_field IS NOT NULL)
          )
    `);

    await trx.schema.createTable(
      'related_collection_card_field',
      (table) => {
        table
          .uuid('id_related_collection')
          .notNullable()
          .references('id_related_collection')
          .inTable(
            'related_collection_definition',
          )
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
          .defaultTo(1);
        table.primary([
          'id_related_collection',
          'id_field',
        ]);
        table.unique([
          'id_related_collection',
          'rank',
        ]);
      },
    );

    await forEachRelationField(
      trx,
      async (tableName, columnName) => {
        const indexName = relationIndexName(
          tableName,
          columnName,
        );
        await trx.raw(
          `CREATE INDEX IF NOT EXISTS ?? ON ?? (??)`,
          [indexName, tableName, columnName],
        );
      },
    );
  });
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.transaction(async (trx) => {
    await forEachRelationField(
      trx,
      async (tableName, columnName) => {
        const indexName = relationIndexName(
          tableName,
          columnName,
        );
        await trx.raw('DROP INDEX IF EXISTS ??', [
          indexName,
        ]);
      },
    );

    await trx.schema.dropTableIfExists(
      'related_collection_card_field',
    );
    await trx.schema.dropTableIfExists(
      'related_collection_definition',
    );

    await trx.raw(`
      ALTER TABLE ui_tab
        DROP CONSTRAINT IF EXISTS ui_tab_content_type_check
    `);
    await trx.schema.alterTable(
      'ui_tab',
      (table) => {
        table.dropColumn('content_type');
      },
    );

    await trx.raw(`
      ALTER TABLE field
        DROP CONSTRAINT IF EXISTS field_relation_kind_check
    `);
    await trx.schema.alterTable(
      'field',
      (table) => {
        table.dropColumn('relation_kind');
      },
    );
  });
}
