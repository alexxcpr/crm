import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import type { AuthenticatedUser } from 'src/security/security.types';
import { CreateOrganizationLogoUploadDto } from 'src/storage/dto/create-organization-logo-upload.dto';
import { FileStorageService } from 'src/storage/file-storage.service';
import { returnValidResponse } from 'src/utils/crud.utils';
import { UpdateOrganizationSettingsDto } from './dto/update-organization-settings.dto';
import { TenantSettingsService } from './tenant-settings.service';

@Controller('v1/admin/settings/organization')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('tenant.manage')
export class AdminTenantSettingsController {
  constructor(
    private readonly settings: TenantSettingsService,
    private readonly files: FileStorageService,
  ) {}

  @Get()
  async get() {
    return returnValidResponse(
      'Configurarea organizatiei.',
      await this.settings.getOrganizationSettings(),
    );
  }

  @Put()
  async update(
    @Body() dto: UpdateOrganizationSettingsDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return returnValidResponse(
      'Configurarea organizatiei a fost actualizata.',
      await this.settings.updateOrganizationSettings(
        dto,
        req.user,
      ),
    );
  }

  @Post('logo/upload-sessions')
  async createLogoUpload(
    @Body() dto: CreateOrganizationLogoUploadDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return returnValidResponse(
      'Sesiunea de upload pentru logo a fost creata.',
      await this.files.createOrganizationLogoUploadSession(
        dto,
        req.user,
      ),
    );
  }

  @Post('logo/upload-sessions/:fileId/complete')
  async completeLogoUpload(
    @Param('fileId') fileId: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return returnValidResponse(
      'Logo-ul a fost confirmat.',
      await this.files.completeUpload(
        fileId,
        req.user,
      ),
    );
  }
}
