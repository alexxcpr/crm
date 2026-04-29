import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';

interface PoolEntry {
  knex: Knex;
  lastUsed: number;
}

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(TenantConnectionManager.name);
  private pools = new Map<string, PoolEntry>();
  private evictInterval: ReturnType<typeof setInterval>;

  private readonly host: string;
  private readonly port: number;
  private readonly user: string;
  private readonly password: string;

  constructor(private readonly config: ConfigService) {
    this.host = config.get<string>('DB_HOST', 'localhost');
    this.port = config.get<number>('DB_PORT', 5432);
    this.user = config.get<string>('DB_USER', 'postgres');
    this.password = config.get<string>('DB_PASSWORD', '');

    const evictMs = 30 * 60 * 1000; // 30 min
    this.evictInterval = setInterval(() => this.evictIdle(evictMs), evictMs);
  }

  getConnection(dbName: string): Knex {
    const entry = this.pools.get(dbName);
    if (entry) {
      entry.lastUsed = Date.now();
      return entry.knex;
    }

    this.logger.log(`Creating Knex pool for database "${dbName}"`);

    const instance = knex({
      client: 'pg',
      connection: {
        host: this.host,
        port: this.port,
        user: this.user,
        password: this.password,
        database: dbName,
      },
      pool: { min: 0, max: 5 },
    });

    this.pools.set(dbName, { knex: instance, lastUsed: Date.now() });
    return instance;
  }

  async evictIdle(maxIdleMs: number): Promise<void> {
    const now = Date.now();
    for (const [dbName, entry] of this.pools) {
      if (now - entry.lastUsed > maxIdleMs) {
        this.logger.log(`Evicting idle pool for "${dbName}"`);
        await entry.knex.destroy();
        this.pools.delete(dbName);
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.evictInterval);
    for (const [dbName, entry] of this.pools) {
      this.logger.log(`Destroying pool for "${dbName}"`);
      await entry.knex.destroy();
    }
    this.pools.clear();
  }
}
