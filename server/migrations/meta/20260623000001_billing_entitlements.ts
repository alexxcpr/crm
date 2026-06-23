import type { Knex } from 'knex';

async function addColumnIfMissing(knex: Knex, columnName: string, addColumn: (table: Knex.AlterTableBuilder) => void) {
  if (await knex.schema.hasColumn('tenants', columnName)) return;

  await knex.schema.alterTable('tenants', addColumn);
}

export async function up(knex: Knex): Promise<void> {
  await addColumnIfMissing(knex, 'billing_status', (t) => t.string('billing_status', 50).notNullable().defaultTo('active'));
  await addColumnIfMissing(knex, 'profile_seats', (t) => t.integer('profile_seats').notNullable().defaultTo(5));
  await addColumnIfMissing(knex, 'included_storage_gb', (t) => t.integer('included_storage_gb').notNullable().defaultTo(10));
  await addColumnIfMissing(knex, 'extra_storage_units', (t) => t.integer('extra_storage_units').notNullable().defaultTo(0));
  await addColumnIfMissing(knex, 'current_period_end', (t) => t.timestamp('current_period_end', { useTz: true }).nullable());

  if (!(await knex.schema.hasTable('tenant_feature_entitlements'))) {
    await knex.schema.createTable('tenant_feature_entitlements', (t) => {
      t.uuid('id').primary().defaultTo(knex.fn.uuid());
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('feature_key', 100).notNullable();
      t.string('status', 50).notNullable().defaultTo('inactive');
      t.string('stripe_subscription_item_id', 100).nullable();
      t.boolean('cancel_at_period_end').notNullable().defaultTo(false);
      t.timestamp('active_from', { useTz: true }).nullable();
      t.timestamp('active_until', { useTz: true }).nullable();
      t.timestamp('current_period_end', { useTz: true }).nullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.unique(['tenant_id', 'feature_key']);
    });
  }

  if (!(await knex.schema.hasTable('tenant_scheduled_billing_changes'))) {
    await knex.schema.createTable('tenant_scheduled_billing_changes', (t) => {
      t.uuid('id').primary().defaultTo(knex.fn.uuid());
      t.uuid('tenant_id').notNullable().references('id').inTable('tenants').onDelete('CASCADE');
      t.string('change_type', 100).notNullable();
      t.jsonb('payload').notNullable().defaultTo('{}');
      t.string('stripe_schedule_id', 100).nullable();
      t.string('status', 50).notNullable().defaultTo('scheduled');
      t.timestamp('effective_at', { useTz: true }).notNullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
      t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('tenant_billing_events'))) {
    await knex.schema.createTable('tenant_billing_events', (t) => {
      t.uuid('id').primary().defaultTo(knex.fn.uuid());
      t.uuid('tenant_id').nullable().references('id').inTable('tenants').onDelete('SET NULL');
      t.string('stripe_event_id', 120).notNullable().unique();
      t.string('event_type', 120).notNullable();
      t.jsonb('payload').notNullable().defaultTo('{}');
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('tenant_billing_events');
  await knex.schema.dropTableIfExists('tenant_scheduled_billing_changes');
  await knex.schema.dropTableIfExists('tenant_feature_entitlements');
  await knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('current_period_end');
    t.dropColumn('extra_storage_units');
    t.dropColumn('included_storage_gb');
    t.dropColumn('profile_seats');
    t.dropColumn('billing_status');
  });
}
