import type { Knex } from 'knex';

const SCHEDULER_USERNAME = 'scheduler';
const SCHEDULER_EMAIL =
  'scheduler@moduvis.system';

export async function up(
  knex: Knex,
): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.schema.alterTable(
      'user',
      (table) => {
        table
          .boolean('is_system')
          .notNullable()
          .defaultTo(false);
      },
    );
    await trx.schema.alterTable(
      'profile',
      (table) => {
        table
          .boolean('is_system')
          .notNullable()
          .defaultTo(false);
      },
    );

    const [schedulerUser] = await trx('user')
      .insert({
        login_username: SCHEDULER_USERNAME,
        hash: 'disabled-system-account',
        must_change_password: false,
        is_active: false,
        is_system: true,
      })
      .onConflict('login_username')
      .ignore()
      .returning('id');
    const user =
      schedulerUser ??
      (await trx('user')
        .where(
          'login_username',
          SCHEDULER_USERNAME,
        )
        .first('id', 'is_system'));
    if (!user?.id || user.is_system === false) {
      throw new Error(
        'Username-ul rezervat "scheduler" este deja folosit de un cont obisnuit.',
      );
    }

    await trx('profile')
      .insert({
        id_user: user.id,
        username: SCHEDULER_USERNAME,
        email: SCHEDULER_EMAIL,
        display_name: 'Scheduler Moduvis',
        access_level: 'tenant_admin',
        is_default: true,
        is_active: true,
        is_system: true,
      })
      .onConflict('username')
      .ignore();

    const profile = await trx('profile')
      .where({
        username: SCHEDULER_USERNAME,
        id_user: user.id,
        is_system: true,
      })
      .first('id_profile');
    if (!profile) {
      throw new Error(
        'Profilul rezervat "scheduler" este deja folosit de un cont obisnuit.',
      );
    }

    await trx.schema.createTable(
      'workflow_schedule',
      (table) => {
        table
          .uuid('id_schedule')
          .primary()
          .defaultTo(trx.fn.uuid());
        table
          .uuid('id_workflow')
          .notNullable()
          .references('id_workflow')
          .inTable('workflow_definition')
          .onDelete('RESTRICT');
        table.string('name', 200).notNullable();
        table
          .string('schedule_type', 20)
          .notNullable();
        table
          .string('cron_expression', 100)
          .nullable();
        table
          .timestamp('run_at', { useTz: true })
          .nullable();
        table
          .string('timezone', 100)
          .notNullable();
        table
          .boolean('is_active')
          .notNullable()
          .defaultTo(true);
        table
          .timestamp('next_run_at', {
            useTz: true,
          })
          .nullable();
        table.uuid('lock_token').nullable();
        table
          .timestamp('locked_until', {
            useTz: true,
          })
          .nullable();
        table
          .uuid('id_created_by_profile')
          .nullable()
          .references('id_profile')
          .inTable('profile')
          .onDelete('SET NULL');
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
          ['is_active', 'next_run_at'],
          'workflow_schedule_due_idx',
        );
        table.index(
          ['id_workflow', 'is_active'],
          'workflow_schedule_workflow_active_idx',
        );
      },
    );
    await trx.raw(`
      ALTER TABLE workflow_schedule
        ADD CONSTRAINT workflow_schedule_type_check
        CHECK (schedule_type IN ('cron', 'once')),
        ADD CONSTRAINT workflow_schedule_definition_check
        CHECK (
          (
            schedule_type = 'cron'
            AND cron_expression IS NOT NULL
            AND run_at IS NULL
          )
          OR
          (
            schedule_type = 'once'
            AND cron_expression IS NULL
            AND run_at IS NOT NULL
          )
        )
    `);

    await trx.schema.alterTable(
      'workflow_execution',
      (table) => {
        table
          .uuid('id_schedule')
          .nullable()
          .references('id_schedule')
          .inTable('workflow_schedule')
          .onDelete('SET NULL');
        table
          .timestamp('scheduled_for', {
            useTz: true,
          })
          .nullable();
        table.index(
          ['id_schedule', 'date_started'],
          'workflow_execution_schedule_started_idx',
        );
      },
    );
    await trx.raw(`
      ALTER TABLE workflow_execution
        DROP CONSTRAINT IF EXISTS workflow_execution_status_check
    `);
    await trx.raw(`
      ALTER TABLE workflow_execution
        ADD CONSTRAINT workflow_execution_status_check
        CHECK (status IN ('running', 'completed', 'failed', 'skipped'))
    `);
  });
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.transaction(async (trx) => {
    await trx.raw(`
      ALTER TABLE workflow_execution
        DROP CONSTRAINT IF EXISTS workflow_execution_status_check
    `);
    await trx('workflow_execution')
      .where('status', 'skipped')
      .update({
        status: 'failed',
        error_code: 'schedule_skipped_rollback',
      });
    await trx.raw(`
      ALTER TABLE workflow_execution
        ADD CONSTRAINT workflow_execution_status_check
        CHECK (status IN ('running', 'completed', 'failed'))
    `);
    await trx.schema.alterTable(
      'workflow_execution',
      (table) => {
        table.dropIndex(
          ['id_schedule', 'date_started'],
          'workflow_execution_schedule_started_idx',
        );
        table.dropColumn('scheduled_for');
        table.dropColumn('id_schedule');
      },
    );
    await trx.schema.dropTableIfExists(
      'workflow_schedule',
    );
    await trx('user')
      .where({
        login_username: SCHEDULER_USERNAME,
        is_system: true,
      })
      .del();
    await trx.schema.alterTable(
      'profile',
      (table) => {
        table.dropColumn('is_system');
      },
    );
    await trx.schema.alterTable(
      'user',
      (table) => {
        table.dropColumn('is_system');
      },
    );
  });
}
