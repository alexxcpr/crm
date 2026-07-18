import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { MetaDbService } from 'src/tenant/meta-db.service';
import {
  BASE_INCLUDED_PROFILE_SEATS,
  BASE_INCLUDED_STORAGE_GB,
  BILLING_FEATURES,
  STORAGE_UNIT_GB,
  STORAGE_UNIT_PRICE_EUR,
} from './billing.constants';
import { StorageQuotaService } from 'src/storage/storage-quota.service';

interface TenantBillingRow {
  id: string;
  slug: string;
  plan: string;
  is_active: boolean;
  max_users: number;
  billing_status: string;
  profile_seats: number;
  included_storage_gb: number;
  extra_storage_units: number;
  subscription_status: string | null;
  current_period_end: Date | string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

interface BillingUpdateInput {
  profileSeats?: number;
  extraStorageUnits?: number;
  reportsDashboards?: boolean;
}

@Injectable()
export class BillingService {
  private readonly isProduction: boolean;

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly metaDb: MetaDbService,
    private readonly config: ConfigService,
    private readonly storageQuota: StorageQuotaService,
  ) {
    this.isProduction = this.config.get<string>('NODE_ENV') === 'production';
  }

  async getBillingState() {
    const tenant = await this.currentTenant();
    const activeProfiles = await this.activeProfileCount();
    const entitlements = await this.entitlements(tenant.id);
    const scheduledChanges = await this.scheduledChanges(tenant.id);
    const storageUsage = await this.storageQuota.state(tenant.slug);

    const profileSeats = Number(tenant.profile_seats || tenant.max_users || BASE_INCLUDED_PROFILE_SEATS);
    const includedStorageGb = Number(tenant.included_storage_gb || BASE_INCLUDED_STORAGE_GB);
    const extraStorageUnits = Number(tenant.extra_storage_units || 0);
    const storageQuotaGb = includedStorageGb + extraStorageUnits * STORAGE_UNIT_GB;
    const features = {
      reportsDashboards: this.isEntitlementActive(entitlements.reports_dashboards),
    };

    return {
      tenant: {
        slug: tenant.slug,
        plan: tenant.plan,
        billingStatus: tenant.billing_status || 'active',
        subscriptionStatus: tenant.subscription_status,
        currentPeriodEnd: tenant.current_period_end,
        isActive: tenant.is_active,
      },
      profileSeats: {
        included: BASE_INCLUDED_PROFILE_SEATS,
        contracted: profileSeats,
        extra: Math.max(0, profileSeats - BASE_INCLUDED_PROFILE_SEATS),
        active: activeProfiles,
      },
      storage: {
        includedGb: includedStorageGb,
        unitGb: STORAGE_UNIT_GB,
        unitPriceEur: STORAGE_UNIT_PRICE_EUR,
        extraUnits: extraStorageUnits,
        quotaGb: storageQuotaGb,
        quotaBytes: storageUsage.quotaBytes,
        usedBytes: storageUsage.usedBytes,
        reservedBytes: storageUsage.reservedBytes,
        remainingBytes: storageUsage.remainingBytes,
        percentage: storageUsage.percentage,
        overQuota: storageUsage.overQuota,
      },
      features,
      entitlements,
      scheduledChanges,
      stripe: {
        hasCustomer: Boolean(tenant.stripe_customer_id),
        hasSubscription: Boolean(tenant.stripe_subscription_id),
      },
    };
  }

  async updateBilling(input: BillingUpdateInput) {
    const tenant = await this.currentTenant();
    const activeProfiles = await this.activeProfileCount();
    const now = this.metaDb.knex.fn.now();
    const currentProfileSeats = Number(tenant.profile_seats || tenant.max_users || BASE_INCLUDED_PROFILE_SEATS);
    const currentStorageUnits = Number(tenant.extra_storage_units || 0);
    const periodEnd = tenant.current_period_end ? new Date(tenant.current_period_end) : null;
    const patch: Record<string, unknown> = { updated_at: now };
    const scheduled: { change_type: string; payload: Record<string, unknown> }[] = [];

    if (input.profileSeats !== undefined) {
      if (!Number.isInteger(input.profileSeats) || input.profileSeats < BASE_INCLUDED_PROFILE_SEATS) {
        throw new BadRequestException(`Numarul de profile trebuie sa fie cel putin ${BASE_INCLUDED_PROFILE_SEATS}.`);
      }
      if (input.profileSeats < activeProfiles) {
        throw new BadRequestException(`Exista deja ${activeProfiles} profile active. Dezactiveaza profile inainte sa scazi limita.`);
      }
      if (input.profileSeats >= currentProfileSeats) {
        patch.profile_seats = input.profileSeats;
        patch.max_users = input.profileSeats;
      } else {
        scheduled.push({ change_type: 'profile_seats', payload: { profileSeats: input.profileSeats } });
      }
    }

    if (input.extraStorageUnits !== undefined) {
      if (!Number.isInteger(input.extraStorageUnits) || input.extraStorageUnits < 0) {
        throw new BadRequestException('Unitatile extra de storage trebuie sa fie un numar pozitiv.');
      }
      if (input.extraStorageUnits >= currentStorageUnits) {
        patch.extra_storage_units = input.extraStorageUnits;
      } else {
        scheduled.push({ change_type: 'extra_storage_units', payload: { extraStorageUnits: input.extraStorageUnits } });
      }
    }

    await this.syncImmediateStripeIncreases(tenant, input, {
      currentProfileSeats,
      currentStorageUnits,
    });

    await this.metaDb.knex.transaction(async (trx) => {
      if (Object.keys(patch).length > 1) {
        await trx('tenants').where({ id: tenant.id }).update(patch);
      }

      if (input.reportsDashboards !== undefined) {
        const status = input.reportsDashboards || periodEnd ? 'active' : 'inactive';
        await trx('tenant_feature_entitlements')
          .insert({
            tenant_id: tenant.id,
            feature_key: BILLING_FEATURES.reportsDashboards.key,
            status,
            active_from: input.reportsDashboards ? trx.fn.now() : null,
            active_until: input.reportsDashboards ? null : periodEnd,
            current_period_end: periodEnd,
            cancel_at_period_end: !input.reportsDashboards,
            updated_at: trx.fn.now(),
          })
          .onConflict(['tenant_id', 'feature_key'])
          .merge({
            status,
            active_from: input.reportsDashboards ? trx.fn.now() : null,
            active_until: input.reportsDashboards ? null : periodEnd,
            current_period_end: periodEnd,
            cancel_at_period_end: !input.reportsDashboards,
            updated_at: trx.fn.now(),
          });
      }

      for (const change of scheduled) {
        await trx('tenant_scheduled_billing_changes').insert({
          tenant_id: tenant.id,
          change_type: change.change_type,
          payload: change.payload,
          effective_at: periodEnd || trx.fn.now(),
        });
      }
    });

    return this.getBillingState();
  }

  async getTenantFeatures(slug: string) {
    const tenant = await this.metaDb.knex('tenants').where({ slug }).first();
    if (!tenant) return null;
    const entitlements = await this.entitlements(tenant.id);
    return {
      billingStatus: tenant.billing_status || 'active',
      profileSeats: Number(tenant.profile_seats || tenant.max_users || BASE_INCLUDED_PROFILE_SEATS),
      storageQuotaGb: Number(tenant.included_storage_gb || BASE_INCLUDED_STORAGE_GB)
        + Number(tenant.extra_storage_units || 0) * STORAGE_UNIT_GB,
      features: {
        reportsDashboards: this.isEntitlementActive(entitlements.reports_dashboards),
      },
    };
  }

  async createCustomerPortalSession() {
    const tenant = await this.currentTenant();
    if (!tenant.stripe_customer_id) {
      throw new BadRequestException('Tenantul nu are un customer Stripe asociat.');
    }

    const baseUrl = this.config.get<string>('PROVISIONING_APP_INTERNAL_URL', '').replace(/\/+$/, '');
    const secret = this.config.get<string>('PROVISIONING_INTERNAL_SECRET', '');
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException('Customer Portal nu este configurat.');
    }

    const domainBase = (this.config.get<string>('DOMAIN_BASE', 'stanciulescu.xyz') || 'stanciulescu.xyz')
      .replace(/^\.+|\.+$/g, '');
    const response = await fetch(`${baseUrl}/api/internal/customer-portal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provisioning-Secret': secret,
      },
      body: JSON.stringify({
        customerId: tenant.stripe_customer_id,
        returnUrl: `https://${tenant.slug}.${domainBase}/admin/billing`,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Nu am putut crea sesiunea Stripe Customer Portal.');
    }

    return response.json() as Promise<{ url: string }>;
  }

  private async currentTenant(): Promise<TenantBillingRow> {
    const tenant = await this.metaDb.knex('tenants')
      .where({ slug: this.tenantContext.slug })
      .first();

    if (!tenant) return this.createDevTenantBillingRow();
    return tenant;
  }

  private async createDevTenantBillingRow(): Promise<TenantBillingRow> {
    if (this.isProduction) {
      throw new NotFoundException('Tenantul nu exista in registrul de billing.');
    }

    const defaultSlug = this.config.get<string>('DEFAULT_TENANT_SLUG', 'dev');
    const defaultDb = this.config.get<string>('DEFAULT_TENANT_DB', 'devdb');
    if (this.tenantContext.slug !== defaultSlug || this.tenantContext.dbName !== defaultDb) {
      throw new NotFoundException('Tenantul nu exista in registrul de billing.');
    }

    const [tenant] = await this.metaDb.knex('tenants')
      .insert({
        slug: defaultSlug,
        db_name: defaultDb,
        plan: 'starter',
        is_active: true,
        max_users: BASE_INCLUDED_PROFILE_SEATS,
        billing_status: 'active',
        profile_seats: BASE_INCLUDED_PROFILE_SEATS,
        included_storage_gb: BASE_INCLUDED_STORAGE_GB,
        extra_storage_units: 0,
        provisioning_status: 'provisioned',
        subscription_status: 'active',
      })
      .onConflict('slug')
      .merge({
        db_name: defaultDb,
        is_active: true,
        billing_status: 'active',
        provisioning_status: 'provisioned',
        updated_at: this.metaDb.knex.fn.now(),
      })
      .returning('*');

    return tenant;
  }

  private async syncImmediateStripeIncreases(
    tenant: TenantBillingRow,
    input: BillingUpdateInput,
    current: { currentProfileSeats: number; currentStorageUnits: number },
  ): Promise<void> {
    const shouldSyncProfileSeats = input.profileSeats !== undefined && input.profileSeats > current.currentProfileSeats;
    const shouldSyncStorage = input.extraStorageUnits !== undefined && input.extraStorageUnits > current.currentStorageUnits;
    const shouldSyncReports = input.reportsDashboards === true;
    if (!shouldSyncProfileSeats && !shouldSyncStorage && !shouldSyncReports) return;
    if (!tenant.stripe_subscription_id) {
      if (!this.isProduction) return;
      throw new BadRequestException('Tenantul nu are un subscription Stripe asociat.');
    }

    const baseUrl = this.config.get<string>('PROVISIONING_APP_INTERNAL_URL', '').replace(/\/+$/, '');
    const secret = this.config.get<string>('PROVISIONING_INTERNAL_SECRET', '');
    if (!baseUrl || !secret) {
      throw new ServiceUnavailableException('Sincronizarea Stripe nu este configurata.');
    }

    const response = await fetch(`${baseUrl}/api/internal/subscription-update`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Provisioning-Secret': secret,
      },
      body: JSON.stringify({
        subscriptionId: tenant.stripe_subscription_id,
        profileSeats: shouldSyncProfileSeats || shouldSyncReports
          ? (input.profileSeats ?? current.currentProfileSeats)
          : undefined,
        extraStorageUnits: shouldSyncStorage ? input.extraStorageUnits : undefined,
        reportsDashboards: shouldSyncReports ? input.reportsDashboards : undefined,
      }),
    });

    if (!response.ok) {
      throw new ServiceUnavailableException('Nu am putut sincroniza modificarile cu Stripe.');
    }
  }

  private async activeProfileCount(): Promise<number> {
    const [{ count }] = await this.tenantContext.knex('profile')
      .where({ is_active: true })
      .count('* as count');
    return Number(count || 0);
  }

  private async entitlements(tenantId: string) {
    const rows = await this.metaDb.knex('tenant_feature_entitlements')
      .where({ tenant_id: tenantId });
    return Object.fromEntries(rows.map((row) => [row.feature_key, row]));
  }

  private async scheduledChanges(tenantId: string) {
    return this.metaDb.knex('tenant_scheduled_billing_changes')
      .where({ tenant_id: tenantId, status: 'scheduled' })
      .orderBy('effective_at', 'asc');
  }

  private isEntitlementActive(row: { status?: string; active_until?: Date | string | null } | undefined): boolean {
    if (!row || row.status !== 'active') return false;
    if (!row.active_until) return true;
    return new Date(row.active_until).getTime() > Date.now();
  }
}
