import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';
import { ReorderDto } from 'src/admin/dto/reorder.dto';

@Controller('v1/admin/workflows')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminWorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Get()
  async findAll() {
    return this.workflowService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.workflowService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateWorkflowDto) {
    const result = await this.workflowService.create(dto);
    return returnValidResponse('Workflow-ul a fost creat cu succes.', result.data);
  }

  @Put('reorder/ranks')
  async reorder(@Body() dto: ReorderDto) {
    const result = await this.workflowService.reorder(dto.items);
    return returnValidResponse('Ordinea workflow-urilor a fost actualizata.', result.data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    const result = await this.workflowService.update(id, dto);
    return returnValidResponse(
      'Workflow-ul a fost actualizat cu succes.',
      result.data,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.workflowService.remove(id);
    return returnValidResponse('Workflow-ul a fost sters cu succes.', null);
  }

  @Delete()
  async removeMany(@Body('ids') ids: string[]) {
    const result = await this.workflowService.removeMany(ids);
    return returnValidResponse(result.message, null);
  }

  @Post(':id/activate')
  async activate(@Param('id') id: string) {
    const result = await this.workflowService.activate(id);
    return returnValidResponse('Workflow-ul a fost activat cu succes.', result.data);
  }

  @Post(':id/deactivate')
  async deactivate(@Param('id') id: string) {
    const result = await this.workflowService.deactivate(id);
    return returnValidResponse('Workflow-ul a fost dezactivat cu succes.', result.data);
  }

  @Post(':id/sync')
  async sync(@Param('id') id: string) {
    const result = await this.workflowService.sync(id);
    return returnValidResponse('Workflow-ul a fost sincronizat cu n8n.', result.data);
  }
}
