import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { returnValidResponse } from 'src/utils/crud.utils';
import { DashboardService } from './dashboard.service';
import { SaveDashboardDto } from './dto/dashboard.dto';

@Controller('v1/admin/dashboards')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminDashboardController {
  constructor(private readonly dashboards: DashboardService) {}

  @Get('catalog')
  async catalog() {
    return returnValidResponse('Catalog dashboard-uri.', await this.dashboards.catalog());
  }

  @Get()
  async findAll() {
    return returnValidResponse('Lista dashboard-urilor.', await this.dashboards.findAllAdmin());
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return returnValidResponse('Detalii dashboard.', await this.dashboards.findOneAdmin(id));
  }

  @Post()
  async create(@Body() dto: SaveDashboardDto) {
    return returnValidResponse('Dashboard-ul a fost creat.', await this.dashboards.create(dto));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: SaveDashboardDto) {
    return returnValidResponse('Dashboard-ul a fost actualizat.', await this.dashboards.update(id, dto));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.dashboards.remove(id);
    return returnValidResponse(result.message, null);
  }
}
