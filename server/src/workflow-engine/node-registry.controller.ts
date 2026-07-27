import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import { returnValidResponse } from 'src/utils/crud.utils';
import { NodeRegistryService } from './node-registry.service';

@Controller('v1/admin/workflow-node-types')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('builder.manage')
export class NodeRegistryController {
  constructor(
    private readonly registry: NodeRegistryService,
  ) {}

  @Get()
  list() {
    return returnValidResponse(
      'Tipurile de noduri au fost incarcate.',
      this.registry.list(),
    );
  }
}
