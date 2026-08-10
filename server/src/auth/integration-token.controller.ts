import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import {
  CreateIntegrationTokenDto,
  RotateIntegrationTokenDto,
} from './dto/integration-token.dto';
import { IntegrationTokenService } from './integration-token.service';

@Controller('v1/admin/integration-tokens')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('tenant.manage')
export class IntegrationTokenController {
  constructor(private readonly tokens: IntegrationTokenService) {}

  @Get()
  async list(@Req() req: { user: AuthenticatedUser }) {
    return returnValidResponse(
      'Token-urile de integrare.',
      await this.tokens.list(req.user.profileId),
    );
  }

  @Post()
  async create(
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: CreateIntegrationTokenDto,
  ) {
    return returnValidResponse(
      'Token-ul de integrare a fost creat. Secretul este afisat o singura data.',
      await this.tokens.create(req.user.profileId, dto),
    );
  }

  @Post(':id/rotate')
  async rotate(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
    @Body() dto: RotateIntegrationTokenDto,
  ) {
    return returnValidResponse(
      'Token-ul de integrare a fost rotit. Secretul este afisat o singura data.',
      await this.tokens.rotate(id, req.user.profileId, dto),
    );
  }

  @Delete(':id')
  async revoke(
    @Param('id') id: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return returnValidResponse(
      'Token-ul de integrare a fost revocat.',
      await this.tokens.revoke(id, req.user.profileId),
    );
  }
}
