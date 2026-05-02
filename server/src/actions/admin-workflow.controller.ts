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
import { returnValidResponse } from 'src/utils/crud.utils';
import { WorkflowService } from './workflow.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto';

@Controller('v1/admin/workflows')
@UseGuards(AuthGuard('jwt'))
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
}
