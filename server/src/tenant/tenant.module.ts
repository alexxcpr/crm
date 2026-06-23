import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { BillingApiClient } from './billing-api.client';
import { MetaDbService } from './meta-db.service';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { InternalProvisioningController } from './internal-provisioning.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  providers: [
    TenantConnectionManager,
    TenantContext,
    MetaDbService,
    BillingApiClient,
    TenantProvisioningService,
  ],
  controllers: [InternalProvisioningController],
  exports: [
    JwtModule,
    TenantConnectionManager,
    TenantContext,
    MetaDbService,
    BillingApiClient,
    TenantProvisioningService,
  ],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantMiddleware)
      .exclude(
        { path: 'health', method: RequestMethod.GET },
        { path: 'internal/provisioning/tenants', method: RequestMethod.POST },
        { path: 'internal/provisioning/tenants/availability', method: RequestMethod.GET },
        { path: 'internal/provisioning/tenants/:slug/status', method: RequestMethod.GET },
        { path: 'internal/provisioning/tenants/:slug/admin-credentials', method: RequestMethod.POST },
        { path: 'internal/provisioning/tenants/:slug/billing-status', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
