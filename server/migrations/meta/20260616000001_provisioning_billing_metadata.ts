import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('tenants', (t) => {
    t.string('company_name', 100).nullable();
    t.string('admin_name', 100).nullable();
    t.string('admin_email', 255).nullable();
    t.string('stripe_customer_id', 100).nullable();
    t.string('stripe_subscription_id', 100).nullable();
    t.string('stripe_checkout_session_id', 100).nullable();
    t.string('subscription_status', 50).nullable();
    t.string('provisioning_status', 50).nullable();
    t.text('provisioning_error').nullable();
  });

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
