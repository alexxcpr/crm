import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { TenantModule } from './tenant/tenant.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DynamicSchemaModule } from './dynamic-schema/dynamic-schema.module';
import { DynamicDataModule } from './dynamic-data/dynamic-data.module';
import { SchemaModule } from './schema/schema.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';
import { ActionsModule } from './actions/actions.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';
import { BillingModule } from './billing/billing.module';
import { NavigationModule } from './navigation/navigation.module';
import { DashboardModule } from './dashboards/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { StorageModule } from './storage/storage.module';
import { ScheduleModule } from '@nestjs/schedule';
import { TenantSettingsModule } from './tenant-settings/tenant-settings.module';
import { CalendarModule } from './calendars/calendar.module';
import { WorkflowSchedulerModule } from './workflow-scheduler/workflow-scheduler.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    EventsModule,
    SecurityModule,
    TenantModule,
    AuthModule,
    UserModule,
    DynamicSchemaModule,
    DynamicDataModule,
    SchemaModule,
    NavigationModule,
    DashboardModule,
    CalendarModule,
    NotificationsModule,
    IntegrationsModule,
    StorageModule,
    TenantSettingsModule,
    AdminModule,
    BillingModule,
    ActionsModule,
    WorkflowSchedulerModule,
    HealthModule,
  ],
})
export class AppModule {}
