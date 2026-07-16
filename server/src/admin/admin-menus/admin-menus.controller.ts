import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { MenuDto, MenuItemDto } from '../dto/menu.dto';
import { AdminMenusService } from './admin-menus.service';
import { ReorderDto } from '../dto/reorder.dto';

@Controller('v1/admin')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminMenusController {
  constructor(private readonly menusService: AdminMenusService) {}

  @Get('menus')
  async findAll() {
    const menus = await this.menusService.findAll();
    return returnValidResponse('Lista meniurilor.', menus);
  }

  @Get('menus/:id')
  async findOne(@Param('id') id: string) {
    const menu = await this.menusService.findOne(id);
    return returnValidResponse('Detalii meniu.', menu);
  }

  @Post('menus')
  async create(@Body() dto: MenuDto) {
    const menu = await this.menusService.create(dto);
    return returnValidResponse('Meniul a fost creat cu succes.', menu);
  }

  @Put('menus/:id')
  async update(@Param('id') id: string, @Body() dto: MenuDto) {
    const menu = await this.menusService.update(id, dto);
    return returnValidResponse('Meniul a fost actualizat cu succes.', menu);
  }

  @Put('menus/reorder/ranks')
  async reorder(@Body() dto: ReorderDto) {
    const menus = await this.menusService.reorder(dto.items);
    return returnValidResponse('Ordinea meniurilor a fost actualizata.', menus);
  }

  @Delete('menus/:id')
  async remove(@Param('id') id: string) {
    const result = await this.menusService.remove(id);
    return returnValidResponse(result.message, null);
  }

  @Post('menus/:id/items')
  async createItem(@Param('id') id: string, @Body() dto: MenuItemDto) {
    const item = await this.menusService.createItem(id, dto);
    return returnValidResponse('Elementul de meniu a fost creat cu succes.', item);
  }

  @Put('menu-items/:id')
  async updateItem(@Param('id') id: string, @Body() dto: MenuItemDto) {
    const item = await this.menusService.updateItem(id, dto);
    return returnValidResponse('Elementul de meniu a fost actualizat cu succes.', item);
  }

  @Put('menu-items/reorder/ranks')
  async reorderItems(@Body() dto: ReorderDto) {
    const items = await this.menusService.reorderItems(dto.items);
    return returnValidResponse('Ordinea elementelor a fost actualizata.', items);
  }

  @Delete('menu-items/:id')
  async removeItem(@Param('id') id: string) {
    const result = await this.menusService.removeItem(id);
    return returnValidResponse(result.message, null);
  }
}
