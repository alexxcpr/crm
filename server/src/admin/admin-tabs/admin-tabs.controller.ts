import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { AdminTabsService } from './admin-tabs.service';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CreateTabDto, UpdateTabDto } from '../dto/tab.dto';

@Controller('v1/admin/entities/:entityId/tabs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class AdminTabsController {
  constructor(private readonly tabsService: AdminTabsService) {}

  @Get()
  async findAll(@Param('entityId') entityId: string) {
    const tabs = await this.tabsService.findAllByEntity(entityId);
    return returnValidResponse('Lista tab-urilor.', tabs);
  }

  @Get(':tabId')
  async findOne(
    @Param('entityId') entityId: string,
    @Param('tabId') tabId: string,
  ) {
    const tab = await this.tabsService.findOne(entityId, tabId);
    return returnValidResponse('Detalii tab.', tab);
  }

  @Post()
  async create(
    @Param('entityId') entityId: string,
    @Body() dto: CreateTabDto,
  ) {
    const tab = await this.tabsService.create(entityId, dto);
    return returnValidResponse('Tab-ul a fost creat cu succes.', tab);
  }

  @Put(':tabId')
  async update(
    @Param('entityId') entityId: string,
    @Param('tabId') tabId: string,
    @Body() dto: UpdateTabDto,
  ) {
    const tab = await this.tabsService.update(entityId, tabId, dto);
    return returnValidResponse('Tab-ul a fost actualizat cu succes.', tab);
  }

  @Delete(':tabId')
  async remove(
    @Param('entityId') entityId: string,
    @Param('tabId') tabId: string,
  ) {
    const result = await this.tabsService.remove(entityId, tabId);
    return returnValidResponse(result.message, null);
  }

  @Delete()
  async removeMany(
    @Param('entityId') entityId: string,
    @Body('ids') ids: string[],
  ) {
    const result = await this.tabsService.removeMany(entityId, ids);
    return returnValidResponse(result.message, null);
  }
}
