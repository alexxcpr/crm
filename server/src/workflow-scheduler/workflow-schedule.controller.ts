import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import {
  CreateWorkflowScheduleDto,
  PreviewWorkflowScheduleDto,
  UpdateWorkflowScheduleDto,
} from './dto/workflow-schedule.dto';
import { WorkflowScheduleService } from './workflow-schedule.service';

@Controller('v1/admin/workflow-schedules')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('builder.manage')
export class WorkflowScheduleController {
  constructor(
    private readonly schedules: WorkflowScheduleService,
  ) {}

  @Get()
  async findAll() {
    return this.schedules.findAll();
  }

  @Post('preview')
  async preview(
    @Body() dto: PreviewWorkflowScheduleDto,
  ) {
    return returnValidResponse(
      'Urmatoarele rulari au fost calculate.',
      await this.schedules.preview(dto),
    );
  }

  @Post()
  async create(
    @Body() dto: CreateWorkflowScheduleDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result = await this.schedules.create(
      dto,
      req.user,
    );
    return returnValidResponse(
      'Programarea a fost creata.',
      result.data,
    );
  }

  @Get(':id/executions')
  async executions(
    @Param('id', ParseUUIDPipe) id: string,
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
    const result =
      await this.schedules.historyList(
        id,
        page,
        limit,
      );
    return {
      ...returnValidResponse(
        'Istoricul programarii a fost incarcat.',
        result.data,
      ),
      meta: result.meta,
    };
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.schedules.findOne(id);
  }

  @Put(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkflowScheduleDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result = await this.schedules.update(
      id,
      dto,
      req.user,
    );
    return returnValidResponse(
      'Programarea a fost actualizata.',
      result.data,
    );
  }

  @Delete(':id')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    await this.schedules.remove(id, req.user);
    return returnValidResponse(
      'Programarea a fost stearsa.',
      null,
    );
  }

  @Post(':id/activate')
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result = await this.schedules.activate(
      id,
      req.user,
    );
    return returnValidResponse(
      'Programarea a fost activata.',
      result.data,
    );
  }

  @Post(':id/deactivate')
  async deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: { user: AuthenticatedUser },
  ) {
    const result =
      await this.schedules.deactivate(
        id,
        req.user,
      );
    return returnValidResponse(
      'Programarea a fost pusa in pauza.',
      result.data,
    );
  }

  @Post(':id/run-now')
  async runNow(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return returnValidResponse(
      'Workflow-ul a rulat.',
      await this.schedules.runNow(id),
    );
  }
}
