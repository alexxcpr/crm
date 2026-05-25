import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import knex, { Knex } from 'knex';

@Injectable()
export class MetaDbService implements OnModuleDestroy {
  private readonly logger = new Logger(MetaDbService.name);
  public readonly knex: Knex;

  constructor(config: ConfigService) {
    this.knex = knex({
      client: 'pg',
      connection: {
        host: config.get<string>('DB_HOST', 'localhost'),
        port: Number(config.get<number>('DB_PORT', 5432)),
        user: config.get<string>('DB_USER', 'postgres'),
        password: config.get<string>('DB_PASSWORD', ''),
        database: config.get<string>('META_DB', 'meta'),
      },
      pool: { min: 0, max: 5 },
    });
  }

  async ping(): Promise<boolean> {
    try {
      await this.knex.raw('select 1');
      return true;
    } catch (error) {
      this.logger.error('Meta DB ping failed', error as Error);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.knex.destroy();
  }
}
