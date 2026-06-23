import type { Knex } from 'knex';

async function addColumnIfMissing(knex: Knex, columnName: string, addColumn: (table: Knex.AlterTableBuilder) => void) {
  if (await knex.schema.hasColumn('tenants', columnName)) return;

  await knex.schema.alterTable('tenants', addColumn);
}

export async function up(knex: Knex): Promise<void> {
  await addColumnIfMissing(knex, 'company_name', (t) => t.string('company_name', 100).nullable());
  await addColumnIfMissing(knex, 'admin_name', (t) => t.string('admin_name', 100).nullable());
  await addColumnIfMissing(knex, 'admin_email', (t) => t.string('admin_email', 255).nullable());
  await addColumnIfMissing(knex, 'stripe_customer_id', (t) => t.string('stripe_customer_id', 100).nullable());
  await addColumnIfMissing(knex, 'stripe_subscription_id', (t) => t.string('stripe_subscription_id', 100).nullable());
  await addColumnIfMissing(knex, 'stripe_checkout_session_id', (t) => t.string('stripe_checkout_session_id', 100).nullable());
  await addColumnIfMissing(knex, 'subscription_status', (t) => t.string('subscription_status', 50).nullable());
  await addColumnIfMissing(knex, 'provisioning_status', (t) => t.string('provisioning_status', 50).nullable());
  await addColumnIfMissing(knex, 'provisioning_error', (t) => t.text('provisioning_error').nullable());

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_subscription_id_unique
    ON tenants (stripe_subscription_id)
    WHERE stripe_subscription_id IS NOT NULL
  `);
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_checkout_session_id_unique
    ON tenants (stripe_checkout_session_id)
    WHERE stripe_checkout_session_id IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS tenants_stripe_subscription_id_unique');
  await knex.raw('DROP INDEX IF EXISTS tenants_stripe_checkout_session_id_unique');

  await knex.schema.alterTable('tenants', (t) => {
    t.dropColumn('provisioning_error');
    t.dropColumn('provisioning_status');
    t.dropColumn('subscription_status');
    t.dropColumn('stripe_checkout_session_id');
    t.dropColumn('stripe_subscription_id');
    t.dropColumn('stripe_customer_id');
    t.dropColumn('admin_email');
    t.dropColumn('admin_name');
    t.dropColumn('company_name');
  });
}
