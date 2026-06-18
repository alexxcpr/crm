import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon from 'argon2';
import knex, { Knex } from 'knex';
import { MetaDbService } from './meta-db.service';
import { migrationDirectory } from './migration-directory';

export interface ProvisionTenantInput {
  slug?: string;
  tenantSlug?: string;
  companyName?: string;
  adminName?: string;
  plan?: string;
  maxUsers?: number;
  adminEmail?: string;
  adminPassword?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  stripeCheckoutSessionId?: string;
  subscriptionStatus?: string;
}

interface TenantRegistryInput {
  slug: string;
  dbName: string;
  companyName: string | null;
  adminName: string | null;
  adminEmail: string | null;
  plan: string;
  maxUsers: number;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeCheckoutSessionId: string | null;
  subscriptionStatus: string;
}

interface TenantRegistryRow {
  slug: string;
  db_name: string;
  is_active: boolean;
  admin_email: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
  provisioning_status: string | null;
}

export type TenantAvailabilityReason =
  | 'invalid_slug'
  | 'reserved_slug'
  | 'tenant_exists'
  | 'database_exists';

export interface TenantAvailabilityResult {
  available: boolean;
  reason?: TenantAvailabilityReason;
}

export interface TenantProvisioningStatusResult {
  status: 'not_found' | 'provisioning' | 'provisioned' | 'failed';
  tenantSlug?: string;
  appUrl?: string;
}

export interface SetAdminCredentialsInput {
  slug: string;
  stripeCheckoutSessionId: string;
  adminEmail: string;
  adminUsername: string;
  password: string;
}

@Injectable()
export class TenantProvisioningService {
  private static readonly RESERVED_SLUGS = new Set([
    'www',
    'api',
    'admin',
    'billing',
    'stripe',
    'n8n',
    'app',
    'moduvis',
    'dev',
    'provisioning',
  ]);

  private readonly logger = new Logger(TenantProvisioningService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metaDb: MetaDbService,
  ) {}

  async provision(input: ProvisionTenantInput): Promise<{ slug: string; dbName: string }> {
    const slug = this.normalizeSlug(input.tenantSlug || input.slug);
    if (this.isReservedSlug(slug)) {
      throw new BadRequestException('Tenant slug is reserved');
    }
    const dbName = slug;
    const registry = this.buildTenantRegistryInput(input, slug, dbName);
    const existing = await this.findTenantRegistry(slug);

    if (existing) {
      this.assertCanUseExistingTenant(existing, registry);
      if (this.isProvisioned(existing)) {
        this.logger.log(`Tenant "${slug}" is already provisioned, returning existing registry`);
        return { slug, dbName: existing.db_name };
      }
    }

    await this.reserveTenantRegistry(registry, existing);

    try {
      await this.ensureDatabase(dbName);
      await this.runTenantMigrations(dbName);
      await this.seedAdminUser(dbName, input.adminEmail, input.adminPassword, input.adminName);
      await this.markTenantProvisioned(registry);
    } catch (error) {
      await this.markTenantProvisioningFailed(registry, error);
      throw error;
    }

    this.logger.log(`Provisioned tenant "${slug}" with database "${dbName}"`);
    return { slug, dbName };
  }

  async checkAvailability(slugInput?: string): Promise<TenantAvailabilityResult> {
    const slug = this.parseSlug(slugInput);
    if (!slug) return { available: false, reason: 'invalid_slug' };
    if (this.isReservedSlug(slug)) return { available: false, reason: 'reserved_slug' };

    const existing = await this.findTenantRegistry(slug);
    if (existing) return { available: false, reason: 'tenant_exists' };

    const dbExists = await this.databaseExists(slug);
    if (dbExists) return { available: false, reason: 'database_exists' };

    return { available: true };
  }

  async getProvisioningStatus(slugInput: string): Promise<TenantProvisioningStatusResult> {
    const slug = this.parseSlug(slugInput);
    if (!slug) return { status: 'not_found' };

    const existing = await this.findTenantRegistry(slug);
    if (!existing) return { status: 'not_found' };

    const status = this.clientSafeProvisioningStatus(existing);
    return {
      status,
      tenantSlug: existing.slug,
      ...(status === 'provisioned' ? { appUrl: this.appUrl(existing.slug) } : {}),
    };
  }

  async setAdminCredentials(input: SetAdminCredentialsInput): Promise<{ slug: string }> {
    const slug = this.parseSlug(input.slug);
    if (!slug) throw this.invalidAdminCredentialsRequest();

    const existing = await this.findTenantRegistry(slug);
    if (!existing || this.clientSafeProvisioningStatus(existing) !== 'provisioned') {
      throw this.invalidAdminCredentialsRequest();
    }

    const checkoutSessionId = this.optionalString(input.stripeCheckoutSessionId);
    const adminEmail = this.optionalString(input.adminEmail)?.toLowerCase();
    const adminUsername = this.normalizeAdminUsername(input.adminUsername);
    if (
      !checkoutSessionId ||
      !adminEmail ||
      !adminUsername ||
      existing.stripe_checkout_session_id !== checkoutSessionId ||
      existing.admin_email?.toLowerCase() !== adminEmail
    ) {
      throw this.invalidAdminCredentialsRequest();
    }

    const tenantDb = this.createTenantConnection(existing.db_name);
    try {
      await tenantDb.transaction(async (trx) => {
        const profile = await trx('profile')
          .whereRaw('LOWER(email) = ?', [adminEmail])
          .where({ is_active: true })
          .first();
        if (!profile) throw this.invalidAdminCredentialsRequest();

        const user = await trx('user')
          .where({ id: profile.id_user, is_active: true })
          .first();
        if (!user || user.must_change_password === false) {
          throw this.invalidAdminCredentialsRequest();
        }

        const duplicateUser = await trx('user')
          .whereRaw('LOWER(login_username) = ?', [adminUsername])
          .whereNot('id', user.id)
          .first();
        const duplicateProfile = await trx('profile')
          .whereRaw('LOWER(username) = ?', [adminUsername])
          .whereNot('id_user', user.id)
          .first();
        if (duplicateUser || duplicateProfile) {
          throw new ConflictException('Utilizatorul administrator ales exista deja.');
        }

        const updated = await trx('user')
          .where({ id: user.id, is_active: true })
          .update({
            login_username: adminUsername,
            hash: await argon.hash(input.password),
            must_change_password: false,
            date_updated: new Date(),
          });
        if (!updated) throw this.invalidAdminCredentialsRequest();

        await trx('profile')
          .where({ id_user: user.id })
          .update({
            username: adminUsername,
          });
      });
    } finally {
      await tenantDb.destroy();
    }

    return { slug };
  }

  private normalizeSlug(slug?: string): string {
    const normalized = this.parseSlug(slug);
    if (!normalized) {
      throw new BadRequestException('Tenant slug must be 3-64 chars, lowercase letters/numbers/dashes, and cannot start or end with dash');
    }
    return normalized;
  }

  private parseSlug(slug?: string): string | null {
    const normalized = slug?.trim().toLowerCase() || '';
    if (!/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/.test(normalized)) {
      return null;
    }
    return normalized;
  }

  private isReservedSlug(slug: string): boolean {
    return TenantProvisioningService.RESERVED_SLUGS.has(slug);
  }

  private buildTenantRegistryInput(input: ProvisionTenantInput, slug: string, dbName: string): TenantRegistryInput {
    return {
      slug,
      dbName,
      companyName: this.optionalString(input.companyName),
      adminName: this.optionalString(input.adminName),
      adminEmail: this.optionalString(input.adminEmail)?.toLowerCase() || null,
      plan: this.optionalString(input.plan) || 'starter',
      maxUsers: this.normalizeMaxUsers(input.maxUsers),
      stripeCustomerId: this.optionalString(input.stripeCustomerId),
      stripeSubscriptionId: this.optionalString(input.stripeSubscriptionId),
      stripeCheckoutSessionId: this.optionalString(input.stripeCheckoutSessionId),
      subscriptionStatus: this.optionalString(input.subscriptionStatus) || 'active',
    };
  }

  private normalizeMaxUsers(maxUsers?: number): number {
    if (maxUsers === undefined || maxUsers === null) return 100;
    if (!Number.isInteger(maxUsers) || maxUsers < 1) {
      throw new BadRequestException('maxUsers must be a positive integer');
    }
    return maxUsers;
  }

  private optionalString(value?: string): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private normalizeAdminUsername(value?: string): string | null {
    const normalized = value?.trim().toLowerCase() || '';
    if (!/^[a-z0-9][a-z0-9._-]{1,62}[a-z0-9]$/.test(normalized)) {
      return null;
    }
    return normalized;
  }

  private async findTenantRegistry(slug: string): Promise<TenantRegistryRow | undefined> {
    return this.metaDb.knex('tenants')
      .select(
        'slug',
        'db_name',
        'is_active',
        'admin_email',
        'stripe_subscription_id',
        'stripe_checkout_session_id',
        'provisioning_status',
      )
      .where({ slug })
      .first();
  }

  private assertCanUseExistingTenant(existing: TenantRegistryRow, input: TenantRegistryInput): void {
    const existingSubscriptionId = existing.stripe_subscription_id;
    const existingCheckoutSessionId = existing.stripe_checkout_session_id;
    const existingHasStripe = Boolean(existingSubscriptionId || existingCheckoutSessionId);
    const incomingHasStripe = Boolean(input.stripeSubscriptionId || input.stripeCheckoutSessionId);

    if (!existingHasStripe && !incomingHasStripe) return;

    const sameSubscription = Boolean(
      existingSubscriptionId &&
      input.stripeSubscriptionId &&
      existingSubscriptionId === input.stripeSubscriptionId,
    );
    const sameCheckout = Boolean(
      existingCheckoutSessionId &&
      input.stripeCheckoutSessionId &&
      existingCheckoutSessionId === input.stripeCheckoutSessionId,
    );

    if (sameSubscription || sameCheckout) return;

    throw new ConflictException('Tenant slug already exists for another subscription');
  }

  private isProvisioned(existing: TenantRegistryRow): boolean {
    return existing.provisioning_status === 'provisioned'
      || (existing.is_active && !existing.provisioning_status);
  }

  private clientSafeProvisioningStatus(
    existing: TenantRegistryRow,
  ): TenantProvisioningStatusResult['status'] {
    if (existing.provisioning_status === 'failed') return 'failed';
    if (this.isProvisioned(existing)) return 'provisioned';
    return 'provisioning';
  }

  private appUrl(slug: string): string {
    const domainBase = (
      this.config.get<string>('DOMAIN_BASE', 'stanciulescu.xyz') || 'stanciulescu.xyz'
    ).replace(/^\.+|\.+$/g, '');
    return `https://${slug}.${domainBase}`;
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

  private async databaseExists(dbName: string): Promise<boolean> {
    const admin = this.createAdminConnection(this.config.get<string>('META_DB', 'meta'));
    try {
      const existing = await admin('pg_database').where({ datname: dbName }).first();
      return Boolean(existing);
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

  private async seedAdminUser(dbName: string, email?: string, password?: string, adminName?: string): Promise<void> {
    if (!email) return;

    const tenantDb = this.createTenantConnection(dbName);
    try {
      const hash = await argon.hash(password || this.randomPassword());
      const user = await tenantDb('user').where({ login_username: 'admin' }).first();
      if (!user) return;
      const loginUsername = this.loginUsernameFromEmail(email);
      await tenantDb.transaction(async (trx) => {
        await trx('user').where('id', user.id).update({ login_username: loginUsername, hash, must_change_password: true });
        await trx('profile').where('id_user', user.id).update({
          username: loginUsername,
          email: email.toLowerCase(),
          display_name: this.optionalString(adminName) || 'Admin',
        });
      });
    } finally {
      await tenantDb.destroy();
    }
  }

  private loginUsernameFromEmail(email: string): string {
    const raw = (email.split('@')[0] || 'admin').toLowerCase();
    return raw.replace(/[^a-z0-9._-]/g, '_').slice(0, 100) || 'admin';
  }

  private async reserveTenantRegistry(input: TenantRegistryInput, existing?: TenantRegistryRow): Promise<void> {
    const data = {
      plan: input.plan,
      is_active: false,
      max_users: input.maxUsers,
      company_name: input.companyName,
      admin_name: input.adminName,
      admin_email: input.adminEmail,
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_checkout_session_id: input.stripeCheckoutSessionId,
      subscription_status: input.subscriptionStatus,
      provisioning_status: 'provisioning',
      provisioning_error: null,
      updated_at: this.metaDb.knex.fn.now(),
    };

    if (existing) {
      await this.metaDb.knex('tenants').where({ slug: input.slug }).update(data);
      return;
    }

    await this.metaDb.knex('tenants').insert({
      slug: input.slug,
      db_name: input.dbName,
      ...data,
    });
  }

  private async markTenantProvisioned(input: TenantRegistryInput): Promise<void> {
    await this.metaDb.knex('tenants')
      .where({ slug: input.slug })
      .update({
        db_name: input.dbName,
        plan: input.plan,
        is_active: true,
        max_users: input.maxUsers,
        company_name: input.companyName,
        admin_name: input.adminName,
        admin_email: input.adminEmail,
        stripe_customer_id: input.stripeCustomerId,
        stripe_subscription_id: input.stripeSubscriptionId,
        stripe_checkout_session_id: input.stripeCheckoutSessionId,
        subscription_status: input.subscriptionStatus,
        provisioning_status: 'provisioned',
        provisioning_error: null,
        updated_at: this.metaDb.knex.fn.now(),
      });
  }

  private async markTenantProvisioningFailed(input: TenantRegistryInput, error: unknown): Promise<void> {
    await this.metaDb.knex('tenants')
      .where({ slug: input.slug })
      .update({
        is_active: false,
        provisioning_status: 'failed',
        provisioning_error: this.errorMessage(error).slice(0, 2000),
        updated_at: this.metaDb.knex.fn.now(),
      });
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown provisioning error';
  }

  private invalidAdminCredentialsRequest(): BadRequestException {
    return new BadRequestException('Datele contului administrator nu sunt valide.');
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
