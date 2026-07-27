import { Global, Module } from '@nestjs/common';
import {
  ThrottlerModule,
  minutes,
} from '@nestjs/throttler';
import { AuthorizationService } from './authorization.service';
import { PublicRateLimitGuard } from './public-rate-limit.guard';
import { AccessControlService } from './access-control.service';
import { CapabilityGuard } from './capability.guard';
import { TenantAuditService } from './tenant-audit.service';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'burst',
        ttl: minutes(1),
        limit: 30,
      },
      {
        name: 'sustained',
        ttl: minutes(15),
        limit: 200,
      },
    ]),
  ],
  providers: [
    AuthorizationService,
    AccessControlService,
    CapabilityGuard,
    TenantAuditService,
    PublicRateLimitGuard,
  ],
  exports: [
    AuthorizationService,
    AccessControlService,
    CapabilityGuard,
    TenantAuditService,
    PublicRateLimitGuard,
  ],
})
export class SecurityModule {}
