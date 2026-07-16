import type { Knex } from 'knex';

export async function up(
  knex: Knex,
): Promise<void> {
  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table
        .integer('rank')
        .notNullable()
        .defaultTo(0);
    },
  );

  await knex.raw(`
    WITH ordered AS (
      SELECT id_workflow, ROW_NUMBER() OVER (ORDER BY date_created ASC) AS new_rank
      FROM workflow_definition
    )
    UPDATE workflow_definition AS workflow
    SET rank = ordered.new_rank::integer
    FROM ordered
    WHERE workflow.id_workflow = ordered.id_workflow
  `);
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table.dropColumn('rank');
    },
  );
}
