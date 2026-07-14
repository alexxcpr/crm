import 'dotenv/config';
import knex, { Knex } from 'knex';
import { MigrationExtension, migrationDirectory } from '../src/tenant/migration-directory';

interface TenantRow {
  slug: string;
  db_name: string;
}

function createConnection(database: string): Knex {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database,
    },
    pool: { min: 0, max: 1 },
  });
}

async function migrationExtension(tenantDb: Knex): Promise<MigrationExtension | undefined> {
  if (!await tenantDb.schema.hasTable('knex_migrations')) return undefined;
  const latest = await tenantDb('knex_migrations').select('name').orderBy('id', 'desc').first();
  if (latest?.name?.endsWith('.ts')) return 'ts';
  if (latest?.name?.endsWith('.js')) return 'js';
  return undefined;
}

async function main() {
  const metaDb = createConnection(process.env.META_DB || 'meta');
  const tenants = await metaDb<TenantRow>('tenants')
    .select('slug', 'db_name')
    .where('is_active', true)
    .orderBy('slug', 'asc');
  await metaDb.destroy();

  const results: Array<{ slug: string; dbName: string; ok: boolean; error?: unknown }> = [];

  for (const tenant of tenants) {
    const tenantDb = createConnection(tenant.db_name);
    try {
      const extension = await migrationExtension(tenantDb);
      await tenantDb.migrate.latest(migrationDirectory('tenant', extension));
      results.push({ slug: tenant.slug, dbName: tenant.db_name, ok: true });
      console.log(`OK ${tenant.slug} (${tenant.db_name})`);
    } catch (error) {
      results.push({ slug: tenant.slug, dbName: tenant.db_name, ok: false, error });
      console.error(`FAIL ${tenant.slug} (${tenant.db_name})`, error);
    } finally {
      await tenantDb.destroy();
    }
  }

  const failed = results.filter((result) => !result.ok);
  console.log(`Migrated ${results.length - failed.length}/${results.length} tenants`);

  if (failed.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
