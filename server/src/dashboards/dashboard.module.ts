import { Module } from '@nestjs/common';
import { BillingModule } from 'src/billing/billing.module';
import { AdminDashboardController } from './admin-dashboard.controller';
import { DashboardAccessService } from './dashboard-access.service';
import { DashboardQueryService } from './dashboard-query.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [BillingModule],
  controllers: [AdminDashboardController, DashboardController],
  providers: [DashboardAccessService, DashboardService, DashboardQueryService],
  exports: [DashboardAccessService, DashboardService],
})
export class DashboardModule {}
