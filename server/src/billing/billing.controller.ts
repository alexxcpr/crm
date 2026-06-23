import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { BillingService } from './billing.service';

@Controller('v1/admin/billing')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
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
