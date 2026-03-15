import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Roles } from 'src/guards/roles.decorator';
import { AdminEntitiesService } from './admin-entities.service';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CreateEntityDto, UpdateEntityDto } from '../dto/entity.dto';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from 'src/guards/roles.guard';

@Controller('v1/admin/entities')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminEntitiesController {
    constructor(private readonly entitiesService: AdminEntitiesService){}

    @Get()
    async findAll(@Query('moduleId') moduleId?: string) {
        const entities = await this.entitiesService.findAll(moduleId);
        return returnValidResponse('Lista entitatilor.', entities);
    }

    @Get(':id')
    async findOne(@Param('id') id: string){
        const entity = await this.entitiesService.findOne(id);
        return returnValidResponse('Detalii entitate.', entity);
    }

    @Post()
    async create(@Body() dto: CreateEntityDto) {
        const entity = await this.entitiesService.create(dto);
        return returnValidResponse('Entitatea a fost creata cu succes.', entity)
    }

    @Put(':id')
    async update(@Param('id') id: string, @Body() dto: UpdateEntityDto){
        const entity = await this.entitiesService.update(id, dto);
        return returnValidResponse('Entitatea a fost actualizata cu succes.', entity);
    }

    @Delete(':id')
    async remove(@Param('id') id: string){
        const result = await this.entitiesService.remove(id);
        return returnValidResponse(result.message, null);
    }
}
