import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantInfo } from 'src/types/entities';

/**
 * Stub BillingApiClient — returns tenant info from env vars.
 * Replace with real HTTP calls when Billing Service exists.
 */
@Injectable()
export class BillingApiClient {
  private readonly logger = new Logger(BillingApiClient.name);
  private readonly defaultSlug: string;
  private readonly defaultDbName: string;

  constructor(private readonly config: ConfigService) {
    this.defaultSlug = config.get<string>('DEFAULT_TENANT_SLUG', 'dev');
    this.defaultDbName = config.get<string>('DEFAULT_TENANT_DB', 'crm_devdb');
  }

  async getCompanyBySlug(slug: string): Promise<TenantInfo | null> {
    // TODO: Replace with HTTP call to Billing Service
    // GET ${BILLING_API_URL}/companies/${slug}
    this.logger.debug(`[STUB] Resolving tenant "${slug}" → db "${this.defaultDbName}"`);

    if (slug !== this.defaultSlug) {
      this.logger.warn(`[STUB] Unknown tenant slug "${slug}", falling back to default`);
    }

    return {
      dbName: this.defaultDbName,
      plan: 'starter',
      isActive: true,
      maxUsers: 100,
    };
  }
}
