import { ForbiddenException, Injectable } from '@nestjs/common';
import { BillingService } from 'src/billing/billing.service';
import { TenantContext } from 'src/tenant/tenant-context.service';

@Injectable()
export class DashboardAccessService {
  constructor(
    private readonly billing: BillingService,
    private readonly tenantContext: TenantContext,
  ) {}

  async isEnabled(): Promise<boolean> {
    const state = await this.billing.getTenantFeatures(this.tenantContext.slug);
    return state?.features?.reportsDashboards === true;
  }

  async requireEnabled(): Promise<void> {
    if (!await this.isEnabled()) {
      throw new ForbiddenException('Functionalitatea Dashboard-uri nu este activa pentru acest abonament.');
    }
  }
}
