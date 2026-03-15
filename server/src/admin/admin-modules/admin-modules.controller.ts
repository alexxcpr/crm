import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { AdminModulesService } from './admin-modules.service';
import { returnValidResponse } from 'src/utils/crud.utils';
import { ModuleDto } from '../dto/module.dto';

@Controller('v1/admin/modules')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminModulesController {
    constructor(private readonly modulesService: AdminModulesService) {}

    @Get()
    async findAll() {
        const modules = await this.modulesService.findAll();
        return returnValidResponse('Lista modulelor.', modules);
    }

    @Get(':id')
    async findOne(@Param('id') id: string) {
        const mod = await this.modulesService.findOne(id);
        return returnValidResponse('Detalii modul.', mod);
    }

    @Post()
    async create(@Body() dto: ModuleDto) {
        const mod = await this.modulesService.create(dto);
        return returnValidResponse('Modulul a fost creat cu succes.', mod);
    }

    @Put(':id')
    async update(
        @Param('id') id: string, 
        @Body() dto: ModuleDto
    ){
        const mod = await this.modulesService.update(id, dto);
        return returnValidResponse('Modulul a fost actualizat cu succes.', mod); 
    }

    @Delete(':id')
    async remove(@Param('id') id: string) {
        const result = await this.modulesService.remove(id);
        return returnValidResponse(result.message, null);
    }
}
