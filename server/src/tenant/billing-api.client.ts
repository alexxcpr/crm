import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantInfo } from 'src/types/entities';
import { MetaDbService } from './meta-db.service';

const BASE_INCLUDED_PROFILE_SEATS = 5;
const BASE_INCLUDED_STORAGE_GB = 10;
const STORAGE_UNIT_GB = 10;

interface CachedTenant {
  value: TenantInfo | null;
  expiresAt: number;
}

@Injectable()
export class BillingApiClient {
  private readonly logger = new Logger(BillingApiClient.name);
  private readonly defaultSlug: string;
  private readonly defaultDbName: string;
  private readonly isProduction: boolean;
  private readonly cache = new Map<string, CachedTenant>();
  private readonly cacheTtlMs = 60 * 1000;

  constructor(
    private readonly config: ConfigService,
    private readonly metaDb: MetaDbService,
  ) {
    this.defaultSlug = config.get<string>('DEFAULT_TENANT_SLUG', 'dev');
    this.defaultDbName = config.get<string>('DEFAULT_TENANT_DB', 'devdb');
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  async getCompanyBySlug(slug: string): Promise<TenantInfo | null> {
    const normalizedSlug = slug.toLowerCase();
    const cached = this.cache.get(normalizedSlug);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const row = await this.metaDb.knex('tenants')
        .select(
          'db_name',
          'db_user',
          'db_password_encrypted',
          'plan',
          'is_active',
          'max_users',
          'billing_status',
          'profile_seats',
          'included_storage_gb',
          'extra_storage_units',
        )
        .where({ slug: normalizedSlug })
        .first();

      const profileSeats = Number(row?.profile_seats || row?.max_users || BASE_INCLUDED_PROFILE_SEATS);
      const includedStorageGb = Number(row?.included_storage_gb || BASE_INCLUDED_STORAGE_GB);
      const extraStorageUnits = Number(row?.extra_storage_units || 0);
      let tenant: TenantInfo | null = row
        ? {
            dbName: row.db_name,
            dbUser: row.db_user,
            dbPassword: row.db_password_encrypted,
            plan: row.plan,
            isActive: row.is_active,
            maxUsers: profileSeats,
            billingStatus: row.billing_status || 'active',
            profileSeats,
            includedStorageGb,
            extraStorageUnits,
            storageQuotaGb: includedStorageGb + extraStorageUnits * STORAGE_UNIT_GB,
          }
        : null;

      if (!this.isProduction && !tenant) {
        this.logger.warn(
          `Tenant "${normalizedSlug}" not found in meta DB, falling back to dev default`,
        );
        tenant = this.resolveDevFallback(normalizedSlug);
      }

      this.cache.set(normalizedSlug, {
        value: tenant,
        expiresAt: Date.now() + this.cacheTtlMs,
      });

      return tenant;
    } catch (error) {
      this.logger.error(`Failed to resolve tenant "${normalizedSlug}" from meta DB`, error as Error);

      if (this.isProduction) {
        throw error;
      }

      const fallback = this.resolveDevFallback(normalizedSlug);
      this.cache.set(normalizedSlug, {
        value: fallback,
        expiresAt: Date.now() + this.cacheTtlMs,
      });
      return fallback;
    }
  }

  private resolveDevFallback(slug: string): TenantInfo | null {
    if (slug !== this.defaultSlug) {
      this.logger.warn(`Unknown tenant slug "${slug}", falling back to default dev tenant`);
    }

    if (!this.defaultDbName) return null;
    return {
      dbName: this.defaultDbName,
      plan: 'starter',
      isActive: true,
      maxUsers: 100,
      billingStatus: 'active',
      profileSeats: 100,
      includedStorageGb: BASE_INCLUDED_STORAGE_GB,
      extraStorageUnits: 0,
      storageQuotaGb: BASE_INCLUDED_STORAGE_GB,
    };
  }
}
