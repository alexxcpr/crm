import { Module } from '@nestjs/common';
import { BillingModule } from 'src/billing/billing.module';
import { DynamicDataModule } from 'src/dynamic-data/dynamic-data.module';
import { TenantSettingsModule } from 'src/tenant-settings/tenant-settings.module';
import { AdminCalendarController } from './admin-calendar.controller';
import { CalendarAccessService } from './calendar-access.service';
import { CalendarQueryService } from './calendar-query.service';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { RelationsModule } from 'src/relations/relations.module';

@Module({
  imports: [
    BillingModule,
    DynamicDataModule,
    TenantSettingsModule,
    RelationsModule,
  ],
  controllers: [
    AdminCalendarController,
    CalendarController,
  ],
  providers: [
    CalendarAccessService,
    CalendarService,
    CalendarQueryService,
  ],
  exports: [
    CalendarAccessService,
    CalendarService,
  ],
})
export class CalendarModule {}
