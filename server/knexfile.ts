import 'dotenv/config';
import type { Knex } from 'knex';

const config: Record<string, Knex.Config> = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    migrations: {
      directory: './migrations/tenant',
      extension: 'ts',
    },
  },

  production: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DEFAULT_TENANT_DB,
    },
    migrations: {
      directory: './migrations/tenant',
      extension: 'ts',
    },
  },
};

export default config;
