import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import { returnValidResponse } from 'src/utils/crud.utils';
import { BillingService } from './billing.service';

@Controller('v1/admin/billing')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('billing.manage')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get()
  async getBillingState() {
    return returnValidResponse('Starea abonamentului.', await this.billing.getBillingState());
  }

  @Post('update')
  async updateBilling(@Body() body: {
    profileSeats?: number;
    extraStorageUnits?: number;
    reportsDashboards?: boolean;
  }) {
    return returnValidResponse('Abonamentul a fost actualizat.', await this.billing.updateBilling(body));
  }

  @Post('customer-portal')
  async customerPortal() {
    return returnValidResponse('Sesiune Stripe Customer Portal.', await this.billing.createCustomerPortalSession());
  }
}
