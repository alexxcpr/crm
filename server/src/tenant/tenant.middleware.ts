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
  private readonly domainBase: string;
  private readonly isProduction: boolean;

  constructor(
    private readonly connManager: TenantConnectionManager,
    private readonly tenantContext: TenantContext,
    private readonly billingClient: BillingApiClient,
    private readonly jwtService: JwtService,
    config: ConfigService,
  ) {
    this.defaultSlug = config.get<string>('DEFAULT_TENANT_SLUG', '');
    this.defaultDb = config.get<string>('DEFAULT_TENANT_DB', '');
    this.domainBase = config.get<string>('DOMAIN_BASE', 'stanciulescu.xyz');
    this.isProduction = config.get<string>('NODE_ENV') === 'production';
  }

  async use(req: Request, _res: Response, next: NextFunction) {
    let dbName: string | undefined;
    let tenantSlug: string | undefined;
    let dbUser: string | null | undefined;
    let dbPassword: string | null | undefined;

    // 1. Resolve tenant from same-origin host or X-Tenant header (login before JWT).
    const requestedTenant = this.getTenantSlug(req);
    if (requestedTenant) {
      const tenantInfo = await this.billingClient.getCompanyBySlug(requestedTenant);
      if (tenantInfo && tenantInfo.isActive) {
        if (tenantInfo.billingStatus === 'blocked' && !this.isBillingRecoveryPath(req.path)) {
          return _res.status(402).json({ message: 'Abonamentul necesita actualizarea platii.' });
        }
        dbName = tenantInfo.dbName;
        dbUser = tenantInfo.dbUser;
        dbPassword = tenantInfo.dbPassword;
        tenantSlug = requestedTenant;
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

    // 3. DEV fallback: use default tenant from env (disabled in production).
    if (!dbName && !this.isProduction && this.defaultDb) {
      dbName = this.defaultDb;
      tenantSlug = this.defaultSlug || 'dev';
    }

    if (!dbName) {
      if (this.isProduction) {
        return _res.status(400).json({ message: 'Tenant could not be resolved' });
      }
      return next();
    }

    const knex = this.connManager.getConnection({ dbName, dbUser, dbPassword });

    this.tenantContext.run({ knex, slug: tenantSlug!, dbName }, next);
  }

  private getTenantSlug(req: Request): string | undefined {
    const xTenant = req.headers['x-tenant'];
    if (typeof xTenant === 'string' && xTenant.trim()) {
      return xTenant.trim().toLowerCase();
    }

    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const hostname = Array.isArray(host) ? host[0] : host;
    if (!hostname) return undefined;

    const cleanHost = hostname.split(':')[0].toLowerCase();
    if (!cleanHost.endsWith(`.${this.domainBase}`)) {
      return undefined;
    }

    const slug = cleanHost.slice(0, -1 * (`.${this.domainBase}`).length);
    return slug || undefined;
  }

  private isBillingRecoveryPath(path: string): boolean {
    return path.startsWith('/auth/')
      || path === '/user/me'
      || path.startsWith('/v1/admin/billing')
      || path === '/health';
  }
}
