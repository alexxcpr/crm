import {
  Controller,
  Get,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PUBLIC_RATE_LIMITS } from 'src/security/public-rate-limit.constants';
import { PublicRateLimitGuard } from 'src/security/public-rate-limit.guard';
import { MetaDbService } from 'src/tenant';

@Controller('health')
@UseGuards(PublicRateLimitGuard)
export class HealthController {
  constructor(private readonly metaDb: MetaDbService) {}

  @Get()
  @Throttle(PUBLIC_RATE_LIMITS.health)
  async health() {
    const metaDbOk = await this.metaDb.ping();
    if (!metaDbOk) {
      throw new ServiceUnavailableException({
        status: 'error',
        checks: { metaDb: false },
      });
    }

    return {
      status: 'ok',
      checks: { metaDb: true },
    };
  }
}
