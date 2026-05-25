import { Global, MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { BillingApiClient } from './billing-api.client';
import { MetaDbService } from './meta-db.service';
import { TenantProvisioningService } from './tenant-provisioning.service';

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
  exports: [
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
      .exclude({ path: 'health', method: RequestMethod.GET })
      .forRoutes('*');
  }
}
