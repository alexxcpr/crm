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
import { N8nModule } from './n8n/n8n.module';
import { HealthModule } from './health/health.module';
import { SecurityModule } from './security/security.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventsModule,
    SecurityModule,
    TenantModule,
    AuthModule,
    UserModule,
    DynamicSchemaModule,
    DynamicDataModule,
    SchemaModule,
    AdminModule,
    ActionsModule,
    N8nModule,
    HealthModule,
  ],
})
export class AppModule {}
