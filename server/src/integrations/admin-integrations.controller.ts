import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiAuthGuard } from 'src/auth/api-auth.guard';
import { IntegrationAccess } from 'src/auth/integration-access.decorator';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import {
  CreateSmtpIntegrationDto,
  DeleteIntegrationDto,
  TestSmtpIntegrationDto,
  UpdateSmtpIntegrationDto,
} from './dto/integration.dto';
import { IntegrationsService } from './integrations.service';
import { SmtpMailService } from './smtp-mail.service';
import type { AuthenticatedUser } from 'src/security/security.types';

@Controller('v1/admin/integrations')
@UseGuards(ApiAuthGuard, CapabilityGuard)
@RequireCapability('tenant.manage')
@IntegrationAccess('integrations')
export class AdminIntegrationsController {
  constructor(
    private readonly integrations: IntegrationsService,
    private readonly smtp: SmtpMailService,
  ) {}

  @Get()
  list(@Query('type') type?: string) {
    return this.integrations.list(type ?? 'smtp');
  }

  @Post('smtp')
  createSmtp(
    @Body() dto: CreateSmtpIntegrationDto,
  ) {
    return this.integrations.createSmtp(dto);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSmtpIntegrationDto,
  ) {
    return this.integrations.update(id, dto);
  }

  @Post(':id/test')
  test(
    @Param('id') id: string,
    @Body() dto: TestSmtpIntegrationDto,
  ) {
    return this.smtp.sendTest(id, dto.to);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Body() dto: DeleteIntegrationDto | undefined,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.integrations.remove(
      id,
      dto?.replacementIntegrationId,
      req.user.profileId,
    );
  }
}
