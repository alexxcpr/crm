import 'dotenv/config';
import type { Knex } from 'knex';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';

function migrationDirectory(kind: 'meta' | 'tenant') {
  const compiled = join(__dirname, 'migrations', kind);
  if (existsSync(compiled) && readdirSync(compiled).some(f => f.endsWith('.js'))) {
    return { directory: compiled, extension: 'js', loadExtensions: ['.js'] };
  }
  if (existsSync(compiled) && readdirSync(compiled).some(f => f.endsWith('.ts'))) {
    return { directory: compiled, extension: 'ts', loadExtensions: ['.ts'] };
  }
  return { directory: join(__dirname, '..', 'migrations', kind), extension: 'ts', loadExtensions: ['.ts'] };
}

function dbConnection(database?: string): Knex.StaticConnectionConfig {
  return {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database,
  };
}

const metaMigrations = migrationDirectory('meta');
const tenantMigrations = migrationDirectory('tenant');

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: tenantMigrations.directory,
      extension: tenantMigrations.extension,
    },
  },

  production: {
    client: 'pg',
    connection: dbConnection(process.env.DEFAULT_TENANT_DB),
    migrations: {
      directory: tenantMigrations.directory,
      extension: tenantMigrations.extension,
    },
  },

  tenant: {
    client: 'pg',
    connection: dbConnection(process.env.DEFAULT_TENANT_DB),
    migrations: {
      directory: tenantMigrations.directory,
      extension: tenantMigrations.extension,
      loadExtensions: ['.js', '.ts']
    },
  },

  meta: {
    client: 'pg',
    connection: dbConnection(process.env.META_DB || 'meta'),
    migrations: {
      directory: metaMigrations.directory,
      extension: metaMigrations.extension,
      loadExtensions: ['.js', '.ts'],
    },
  },
};

export default config;
