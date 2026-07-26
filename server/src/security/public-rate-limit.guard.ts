import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerLimitDetail,
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { TenantContext } from 'src/tenant/tenant-context.service';

const RATE_LIMIT_MESSAGE =
  'Prea multe cereri. Încearcă din nou mai târziu.';

@Injectable()
export class PublicRateLimitGuard extends ThrottlerGuard {
  private readonly logger = new Logger(
    PublicRateLimitGuard.name,
  );

  constructor(
    @InjectThrottlerOptions()
    options: ThrottlerModuleOptions,
    @InjectThrottlerStorage()
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly tenantContext: TenantContext,
  ) {
    super(options, storageService, reflector);
  }

  protected getTracker(
    req: Record<string, any>,
  ): Promise<string> {
    const ip =
      typeof req.ip === 'string' && req.ip.trim()
        ? req.ip.trim()
        : 'unknown';
    const scope = this.tenantContext.isAvailable
      ? this.tenantContext.slug
      : 'infrastructure';

    return Promise.resolve(`${scope}:${ip}`);
  }

  protected throwThrottlingException(
    context: ExecutionContext,
    detail: ThrottlerLimitDetail,
  ): Promise<void> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const retryAfter = Math.max(
      1,
      detail.timeToBlockExpire,
    );
    const path = String(
      req.originalUrl ?? req.url ?? '',
    ).split('?')[0];
    const trackerHash = createHash('sha256')
      .update(detail.tracker)
      .digest('hex')
      .slice(0, 12);

    res.setHeader(
      'Retry-After',
      String(retryAfter),
    );
    this.logger.warn({
      event: 'public_rate_limit_exceeded',
      method: req.method ?? 'UNKNOWN',
      path,
      tenant: this.tenantContext.isAvailable
        ? this.tenantContext.slug
        : 'infrastructure',
      trackerHash,
      retryAfter,
    });

    return Promise.reject(
      new HttpException(
        {
          statusCode:
            HttpStatus.TOO_MANY_REQUESTS,
          error: 'TooManyRequests',
          message: RATE_LIMIT_MESSAGE,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      ),
    );
  }
}
