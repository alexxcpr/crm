import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import { ProvisionTenantDto, SetAdminCredentialsDto, TenantAvailabilityQueryDto } from './dto/provision-tenant.dto';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Controller('internal/provisioning/tenants')
export class InternalProvisioningController {
  constructor(
    private readonly config: ConfigService,
    private readonly provisioning: TenantProvisioningService,
  ) {}

  @Post()
  async provision(
    @Headers('x-provisioning-secret') secret: string | undefined,
    @Body() dto: ProvisionTenantDto,
  ) {
    this.assertSecret(secret);

    const result = await this.provisioning.provision(dto);

    return {
      success: true,
      data: {
        tenantSlug: result.slug,
        dbName: result.dbName,
        appUrl: this.appUrl(result.slug),
      },
    };
  }

  @Get('availability')
  async availability(
    @Headers('x-provisioning-secret') secret: string | undefined,
    @Query() query: TenantAvailabilityQueryDto,
  ) {
    this.assertSecret(secret);

    return {
      success: true,
      data: await this.provisioning.checkAvailability(query.slug),
    };
  }

  @Get(':slug/status')
  async status(
    @Headers('x-provisioning-secret') secret: string | undefined,
    @Param('slug') slug: string,
  ) {
    this.assertSecret(secret);

    return {
      success: true,
      data: await this.provisioning.getProvisioningStatus(slug),
    };
  }

  @Post(':slug/admin-credentials')
  async setAdminCredentials(
    @Headers('x-provisioning-secret') secret: string | undefined,
    @Param('slug') slug: string,
    @Body() dto: SetAdminCredentialsDto,
  ) {
    this.assertSecret(secret);

    const result = await this.provisioning.setAdminCredentials({
      slug,
      stripeCheckoutSessionId: dto.stripeCheckoutSessionId,
      adminEmail: dto.adminEmail,
      adminUsername: dto.adminUsername,
      password: dto.password,
    });

    return {
      success: true,
      data: {
        tenantSlug: result.slug,
        appUrl: this.appUrl(result.slug),
      },
    };
  }

  private assertSecret(secret?: string): void {
    const expected = this.config.get<string>('PROVISIONING_INTERNAL_SECRET');
    if (!expected) {
      throw new ServiceUnavailableException('Provisioning internal secret is not configured');
    }

    if (!secret || !this.safeCompare(secret, expected)) {
      throw new UnauthorizedException('Provisioning secret invalid');
    }
  }

  private safeCompare(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length
      && timingSafeEqual(actualBuffer, expectedBuffer);
  }

  private appUrl(slug: string): string {
    const domainBase = (
      this.config.get<string>('DOMAIN_BASE', 'stanciulescu.xyz') || 'stanciulescu.xyz'
    ).replace(/^\.+|\.+$/g, '');
    return `https://${slug}.${domainBase}`;
  }
}
