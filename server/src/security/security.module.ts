import { Global, Module } from '@nestjs/common';
import {
  ThrottlerModule,
  minutes,
} from '@nestjs/throttler';
import { AuthorizationService } from './authorization.service';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

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
    PublicRateLimitGuard,
  ],
  exports: [
    AuthorizationService,
    PublicRateLimitGuard,
  ],
})
export class SecurityModule {}
