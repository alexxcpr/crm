import {
  Controller,
  Get,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { NodeRegistryService } from './node-registry.service';

@Controller('v1/admin/workflow-node-types')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
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
