import {
  Body,
  Controller,
  Delete,
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
import { returnValidResponse } from 'src/utils/crud.utils';
import {
  CreateWorkflowHttpDomainDto,
  UpdateWorkflowHttpDomainDto,
} from './dto/http-domain.dto';
import { WorkflowHttpDomainService } from './http-domain.service';

@Controller('v1/admin/workflow-http-domains')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('builder.manage')
export class WorkflowHttpDomainController {
  constructor(
    private readonly domains: WorkflowHttpDomainService,
  ) {}

  @Get()
  async list() {
    return returnValidResponse(
      'Domeniile HTTP aprobate au fost incarcate.',
      await this.domains.list(),
    );
  }

  @Post()
  async create(
    @Body() dto: CreateWorkflowHttpDomainDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return returnValidResponse(
      'Domeniul HTTP a fost aprobat.',
      await this.domains.create(
        dto,
        req.user.profileId,
      ),
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowHttpDomainDto,
  ) {
    return returnValidResponse(
      'Domeniul HTTP a fost actualizat.',
      await this.domains.update(id, dto),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.domains.remove(id);
    return returnValidResponse(
      'Domeniul HTTP a fost eliminat.',
      null,
    );
  }
}
