import {
  Controller,
  Get,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PublicRateLimitGuard } from 'src/security/public-rate-limit.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('v1/public/tenant-branding')
@UseGuards(PublicRateLimitGuard)
export class PublicTenantBrandingController {
  constructor(
    private readonly settings: TenantSettingsService,
  ) {}

  @Get()
  async get() {
    return returnValidResponse(
      'Branding tenant.',
      await this.settings.getPublicBranding(),
    );
  }

  @Get('logo')
  async logo(@Res() response: Response) {
    const url =
      await this.settings.getPublicLogoUrl();
    return response.redirect(302, url);
  }
}
