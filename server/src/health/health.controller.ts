import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { MetaDbService } from 'src/tenant';

@Controller('health')
export class HealthController {
  constructor(private readonly metaDb: MetaDbService) {}

  @Get()
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
