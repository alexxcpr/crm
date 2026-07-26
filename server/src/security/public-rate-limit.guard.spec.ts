import {
  Controller,
  Get,
  Logger,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  Throttle,
  ThrottlerModule,
  minutes,
} from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import request from 'supertest';
import type { Knex } from 'knex';
import { AuthController } from 'src/auth/auth.controller';
import { GlobalExceptionFilter } from 'src/filters/http-exception.filter';
import { HealthController } from 'src/health/health.controller';
import { MetaDbService } from 'src/tenant';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { PUBLIC_RATE_LIMITS } from './public-rate-limit.constants';
import { PublicRateLimitGuard } from './public-rate-limit.guard';

@Controller('rate-limit-test')
@UseGuards(PublicRateLimitGuard)
class RateLimitTestController {
  @Get('burst')
  @Throttle({
    burst: { limit: 2, ttl: minutes(1) },
    sustained: { limit: 100, ttl: minutes(15) },
  })
  burst() {
    return { ok: true };
  }

  @Get('sustained')
  @Throttle({
    burst: { limit: 100, ttl: minutes(1) },
    sustained: { limit: 2, ttl: minutes(15) },
  })
  sustained() {
    return { ok: true };
  }
}

class ExposedPublicRateLimitGuard extends PublicRateLimitGuard {
  tracker(req: Record<string, any>) {
    return this.getTracker(req);
  }
}

interface RateLimitErrorBody {
  success: boolean;
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
}

function getMethodMetadata(
  target: object,
  methodName: string,
  metadataKey: string,
): unknown {
  const method: unknown =
    Object.getOwnPropertyDescriptor(
      target,
      methodName,
    )?.value;
  if (typeof method !== 'function') {
    throw new Error(
      `Metoda ${methodName} nu există.`,
    );
  }

  return Reflect.getMetadata(
    metadataKey,
    method,
  ) as unknown;
}

describe('PublicRateLimitGuard', () => {
  let app: NestExpressApplication;
  let tenantContext: TenantContext;

  beforeAll(async () => {
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const moduleFixture: TestingModule =
      await Test.createTestingModule({
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
        controllers: [
          RateLimitTestController,
          HealthController,
        ],
        providers: [
          PublicRateLimitGuard,
          TenantContext,
          {
            provide: MetaDbService,
            useValue: {
              ping: jest
                .fn()
                .mockResolvedValue(true),
            },
          },
        ],
      }).compile();

    app =
      moduleFixture.createNestApplication<NestExpressApplication>();
    app.set('trust proxy', 1);
    app.useGlobalFilters(
      new GlobalExceptionFilter(),
    );
    await app.init();

    tenantContext = moduleFixture.get(
      TenantContext,
    );
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('uses tenant and IP when tenant context is available', async () => {
    const options: ThrottlerModuleOptions = [
      {
        name: 'burst',
        ttl: minutes(1),
        limit: 1,
      },
    ];
    const storage = {
      increment: jest.fn(),
    } as unknown as ThrottlerStorage;
    const guard = new ExposedPublicRateLimitGuard(
      options,
      storage,
      new Reflector(),
      tenantContext,
    );
    const knex = {} as Knex;

    const tenantA = await tenantContext.run(
      {
        knex,
        slug: 'tenant-a',
        dbName: 'tenant_a',
      },
      () => guard.tracker({ ip: '203.0.113.10' }),
    );
    const tenantB = await tenantContext.run(
      {
        knex,
        slug: 'tenant-b',
        dbName: 'tenant_b',
      },
      () => guard.tracker({ ip: '203.0.113.10' }),
    );
    const anotherIp = await tenantContext.run(
      {
        knex,
        slug: 'tenant-a',
        dbName: 'tenant_a',
      },
      () => guard.tracker({ ip: '203.0.113.11' }),
    );

    expect(tenantA).toBe('tenant-a:203.0.113.10');
    expect(tenantB).toBe('tenant-b:203.0.113.10');
    expect(anotherIp).toBe(
      'tenant-a:203.0.113.11',
    );
  });

  it('falls back to infrastructure and IP outside tenant context', async () => {
    const options: ThrottlerModuleOptions = [
      {
        name: 'burst',
        ttl: minutes(1),
        limit: 1,
      },
    ];
    const storage = {
      increment: jest.fn(),
    } as unknown as ThrottlerStorage;
    const guard = new ExposedPublicRateLimitGuard(
      options,
      storage,
      new Reflector(),
      tenantContext,
    );

    await expect(
      guard.tracker({ ip: '198.51.100.20' }),
    ).resolves.toBe(
      'infrastructure:198.51.100.20',
    );
  });

  it('returns the standard 429 response and Retry-After on request N+1', async () => {
    const agent = request(app.getHttpServer());
    const ip = '203.0.113.30';

    await agent
      .get('/rate-limit-test/burst')
      .set('X-Forwarded-For', ip)
      .expect(200);
    await agent
      .get('/rate-limit-test/burst')
      .set('X-Forwarded-For', ip)
      .expect(200);
    const response = await agent
      .get('/rate-limit-test/burst')
      .set('X-Forwarded-For', ip)
      .expect(429);

    expect(
      response.headers['retry-after'],
    ).toBeDefined();
    const body =
      response.body as RateLimitErrorBody;
    expect(body).toMatchObject({
      success: false,
      statusCode: 429,
      error: 'TooManyRequests',
      message:
        'Prea multe cereri. Încearcă din nou mai târziu.',
    });
    expect(body.timestamp).toEqual(
      expect.any(String),
    );
  });

  it('enforces the sustained window independently from burst', async () => {
    const agent = request(app.getHttpServer());
    const ip = '203.0.113.31';

    await agent
      .get('/rate-limit-test/sustained')
      .set('X-Forwarded-For', ip)
      .expect(200);
    await agent
      .get('/rate-limit-test/sustained')
      .set('X-Forwarded-For', ip)
      .expect(200);
    await agent
      .get('/rate-limit-test/sustained')
      .set('X-Forwarded-For', ip)
      .expect(429);
  });

  it('keeps the Docker health-check frequency below the configured limit', async () => {
    const agent = request(app.getHttpServer());

    for (let index = 0; index < 6; index += 1) {
      await agent
        .get('/health')
        .set('X-Forwarded-For', '127.0.0.1')
        .expect(200);
    }

    expect(
      PUBLIC_RATE_LIMITS.health.burst.limit,
    ).toBeGreaterThan(6);
  });

  it('skips both public throttlers for switch-profile', () => {
    expect(
      getMethodMetadata(
        AuthController.prototype,
        'switchProfile',
        'THROTTLER:SKIPburst',
      ),
    ).toBe(true);
    expect(
      getMethodMetadata(
        AuthController.prototype,
        'switchProfile',
        'THROTTLER:SKIPsustained',
      ),
    ).toBe(true);
  });
});
