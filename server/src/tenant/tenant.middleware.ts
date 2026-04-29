import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request, Response, NextFunction } from 'express';
import { TenantConnectionManager } from './tenant-connection.manager';
import { TenantContext } from './tenant-context.service';
import { BillingApiClient } from './billing-api.client';
import { JwtPayload } from 'src/types/entities';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);
  private readonly defaultSlug: string;
  private readonly defaultDb: string;

  constructor(
    private readonly connManager: TenantConnectionManager,
    private readonly tenantContext: TenantContext,
    private readonly billingClient: BillingApiClient,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.defaultSlug = config.get<string>('DEFAULT_TENANT_SLUG', '');
    this.defaultDb = config.get<string>('DEFAULT_TENANT_DB', '');
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    let dbName: string | undefined;
    let tenantSlug: string | undefined;

    // 1. Try X-Tenant header (used at login, before JWT exists)
    const xTenant = req.headers['x-tenant'] as string | undefined;
    if (xTenant) {
      const tenantInfo = await this.billingClient.getCompanyBySlug(xTenant);
      if (tenantInfo && tenantInfo.isActive) {
        dbName = tenantInfo.dbName;
        tenantSlug = xTenant;
      }
    }

    // 2. Fallback: decode JWT to extract dbName (quick decode, no verify — guard validates later)
    if (!dbName) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        try {
          const token = authHeader.split(' ')[1];
          const decoded = this.jwtService.decode<JwtPayload>(token);
          if (decoded?.dbName) {
            dbName = decoded.dbName;
            tenantSlug = decoded.tenant;
          }
        } catch {
          // Invalid token — let auth guard handle rejection
        }
      }
    }

    // 3. DEV fallback: use default tenant from env (when no billing service)
    if (!dbName && this.defaultDb) {
      dbName = this.defaultDb;
      tenantSlug = this.defaultSlug || 'dev';
    }

    if (!dbName) {
      return next();
    }

    const knex = this.connManager.getConnection(dbName);

    this.tenantContext.run({ knex, slug: tenantSlug!, dbName }, next);
  }
}
