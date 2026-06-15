import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon from 'argon2';
import knex, { Knex } from 'knex';
import { MetaDbService } from './meta-db.service';
import { migrationDirectory } from './migration-directory';

export interface ProvisionTenantInput {
  slug: string;
  plan?: string;
  maxUsers?: number;
  adminEmail?: string;
  adminPassword?: string;
}

@Injectable()
export class TenantProvisioningService {
  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metaDb: MetaDbService,
  ) {}

  async provision(input: ProvisionTenantInput): Promise<{ slug: string; dbName: string }> {
    const slug = this.normalizeSlug(input.slug);
    const dbName = `crm_${slug.replaceAll('-', '_')}`;

    await this.ensureDatabase(dbName);
    await this.runTenantMigrations(dbName);
    await this.seedAdminUser(dbName, input.adminEmail, input.adminPassword);
    await this.insertTenantRegistry({
      slug,
      dbName,
      plan: input.plan || 'starter',
      maxUsers: input.maxUsers || 100,
    });

    this.logger.log(`Provisioned tenant "${slug}" with database "${dbName}"`);
    return { slug, dbName };
  }

  private normalizeSlug(slug: string): string {
    const normalized = slug.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(normalized)) {
      throw new Error('Tenant slug must be 3-64 chars, lowercase letters/numbers/dashes, and cannot start or end with dash');
    }
    return normalized;
  }

  private async ensureDatabase(dbName: string): Promise<void> {
    const admin = this.createAdminConnection(this.config.get<string>('META_DB', 'meta'));
    try {
      const existing = await admin('pg_database').where({ datname: dbName }).first();
      if (existing) {
        this.logger.warn(`Database "${dbName}" already exists, skipping create`);
        return;
      }

      await admin.raw('CREATE DATABASE ??', [dbName]);
    } finally {
      await admin.destroy();
    }
  }

  private async runTenantMigrations(dbName: string): Promise<void> {
    const tenantDb = this.createTenantConnection(dbName);
    try {
      await tenantDb.migrate.latest(migrationDirectory('tenant'));
    } finally {
      await tenantDb.destroy();
    }
  }

  private async seedAdminUser(dbName: string, email?: string, password?: string): Promise<void> {
    if (!email) return;

    const tenantDb = this.createTenantConnection(dbName);
    try {
      const hash = await argon.hash(password || this.randomPassword());
      const user = await tenantDb('user').where({ login_username: 'admin' }).first();
      if (!user) return;
      const loginUsername = (email.split('@')[0] || 'admin').toLowerCase();
      await tenantDb.transaction(async (trx) => {
        await trx('user').where('id', user.id).update({ login_username: loginUsername, hash, must_change_password: true });
        await trx('profile').where('id_user', user.id).update({
          username: loginUsername,
          email: email.toLowerCase(),
          display_name: 'Admin',
        });
      });
    } finally {
      await tenantDb.destroy();
    }
  }

  private async insertTenantRegistry(input: {
    slug: string;
    dbName: string;
    plan: string;
    maxUsers: number;
  }): Promise<void> {
    await this.metaDb.knex('tenants')
      .insert({
        slug: input.slug,
        db_name: input.dbName,
        plan: input.plan,
        is_active: true,
        max_users: input.maxUsers,
      })
      .onConflict('slug')
      .merge({
        db_name: input.dbName,
        plan: input.plan,
        is_active: true,
        max_users: input.maxUsers,
        updated_at: this.metaDb.knex.fn.now(),
      });
  }

  private createAdminConnection(database: string): Knex {
    return knex({
      client: 'pg',
      connection: {
        host: this.config.get<string>('DB_HOST', 'localhost'),
        port: Number(this.config.get<number>('DB_PORT', 5432)),
        user: this.config.get<string>('DB_ADMIN_USER') || this.config.get<string>('DB_USER'),
        password: this.config.get<string>('DB_ADMIN_PASSWORD') || this.config.get<string>('DB_PASSWORD'),
        database,
      },
      pool: { min: 0, max: 1 },
    });
  }

  private createTenantConnection(database: string): Knex {
    return knex({
      client: 'pg',
      connection: {
        host: this.config.get<string>('DB_HOST', 'localhost'),
        port: Number(this.config.get<number>('DB_PORT', 5432)),
        user: this.config.get<string>('DB_USER'),
        password: this.config.get<string>('DB_PASSWORD'),
        database,
      },
      pool: { min: 0, max: 1 },
    });
  }

  private randomPassword(): string {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
