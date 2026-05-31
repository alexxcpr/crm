import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { returnValidResponse } from 'src/utils/crud.utils';
import { ActionService } from './action.service';
import { CreateActionDto, UpdateActionDto } from './dto';

@Controller('v1/admin/actions')
@UseGuards(AuthGuard('jwt'))
export class AdminActionController {
  constructor(private readonly actionService: ActionService) {}

  @Get()
  async findAll(@Query('entityId') entityId?: string) {
    return this.actionService.findAll(entityId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.actionService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateActionDto) {
    const result = await this.actionService.create(dto);
    return returnValidResponse('Actiunea a fost creata cu succes.', result.data);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateActionDto) {
    const result = await this.actionService.update(id, dto);
    return returnValidResponse(
      'Actiunea a fost actualizata cu succes.',
      result.data,
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    await this.actionService.remove(id);
    return returnValidResponse('Actiunea a fost stearsa cu succes.', null);
  }

  @Delete()
  async removeMany(@Body('ids') ids: string[]) {
    const result = await this.actionService.removeMany(ids);
    return returnValidResponse(result.message, null);
  }
}
