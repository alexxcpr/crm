import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Test,
  TestingModule,
} from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import {
  ThrottlerModule,
  minutes,
} from '@nestjs/throttler';
import request from 'supertest';
import { GlobalExceptionFilter } from 'src/filters/http-exception.filter';
import { PublicRateLimitGuard } from 'src/security/public-rate-limit.guard';
import { TenantContext } from './tenant-context.service';
import { InternalProvisioningController } from './internal-provisioning.controller';
import { TenantProvisioningService } from './tenant-provisioning.service';

describe('InternalProvisioningController rate limiting', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    const config = {
      get: jest.fn(
        (key: string, fallback?: string) => {
          if (
            key === 'PROVISIONING_INTERNAL_SECRET'
          )
            return 'expected-secret';
          if (key === 'DOMAIN_BASE')
            return 'stanciulescu.xyz';
          return fallback;
        },
      ),
    };
    const provisioning = {
      provision: jest.fn().mockResolvedValue({
        slug: 'acme',
        dbName: 'acme',
      }),
    };
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
          InternalProvisioningController,
        ],
        providers: [
          PublicRateLimitGuard,
          TenantContext,
          {
            provide: ConfigService,
            useValue: config,
          },
          {
            provide: TenantProvisioningService,
            useValue: provisioning,
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
  });

  afterAll(async () => {
    await app.close();
    jest.restoreAllMocks();
  });

  it('preserves secret validation before the limit, then returns 429', async () => {
    const agent = request(app.getHttpServer());
    const ip = '198.51.100.50';

    for (let index = 0; index < 20; index += 1) {
      await agent
        .post('/internal/provisioning/tenants')
        .set('X-Forwarded-For', ip)
        .send({})
        .expect(401);
    }

    const response = await agent
      .post('/internal/provisioning/tenants')
      .set('X-Forwarded-For', ip)
      .send({})
      .expect(429);

    expect(
      response.headers['retry-after'],
    ).toBeDefined();
    const body = response.body as {
      error: string;
    };
    expect(body.error).toBe('TooManyRequests');
  });

  it('allows a valid internal request below the write limit', async () => {
    await request(app.getHttpServer())
      .post('/internal/provisioning/tenants')
      .set('X-Forwarded-For', '198.51.100.51')
      .set(
        'x-provisioning-secret',
        'expected-secret',
      )
      .send({ tenantSlug: 'acme' })
      .expect(201)
      .expect({
        success: true,
        data: {
          tenantSlug: 'acme',
          dbName: 'acme',
          appUrl: 'https://acme.stanciulescu.xyz',
        },
      });
  });
});
