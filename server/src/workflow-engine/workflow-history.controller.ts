import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { WorkflowHistoryService } from './workflow-history.service';

@Controller(
  'v1/admin/workflows/:workflowId/executions',
)
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class WorkflowHistoryController {
  constructor(
    private readonly history: WorkflowHistoryService,
  ) {}

  @Get()
  async list(
    @Param('workflowId') workflowId: string,
    @Query(
      'page',
      new ParseIntPipe({ optional: true }),
    )
    page = 1,
    @Query(
      'limit',
      new ParseIntPipe({ optional: true }),
    )
    limit = 25,
  ) {
    const result = await this.history.list(
      workflowId,
      page,
      limit,
    );
    return {
      ...returnValidResponse(
        'Istoricul workflow-ului a fost incarcat.',
        result.data,
      ),
      meta: result.meta,
    };
  }

  @Get(':executionId')
  async detail(
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
  ) {
    return returnValidResponse(
      'Executia workflow-ului a fost incarcata.',
      await this.history.detail(
        workflowId,
        executionId,
      ),
    );
  }
}
