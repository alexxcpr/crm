import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context.service';
import { TenantMiddleware } from './tenant.middleware';
import { BillingApiClient } from './billing-api.client';

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
    BillingApiClient,
  ],
  exports: [
    TenantConnectionManager,
    TenantContext,
    BillingApiClient,
  ],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
