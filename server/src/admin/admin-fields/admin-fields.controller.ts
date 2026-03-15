import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from 'src/guards/roles.decorator';
import { AdminFieldsService } from './admin-fields.service';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CreateFieldDto, UpdateFieldDto } from '../dto/field.dto';

@Controller('v1/admin/entities/:entityId/fields')
@Roles('admin')
export class AdminFieldsController {
    constructor(private readonly fieldsService: AdminFieldsService){}

    @Get()
    async findAll(@Param('entityId') entityId: string){
        const fields = await this.fieldsService.findAllByEntity(entityId);
        return returnValidResponse('Lista campurilor entitatii.', fields);
    }

    @Get(':fieldId')
    async findOne (
        @Param('entityId') entityId: string,
        @Param('fieldId') fieldId: string,
    ) {
        const field = await this.fieldsService.findOne(entityId, fieldId);
        return returnValidResponse('Detalii camp.', field);
    }

    @Post()
    async create (
        @Param('entityId') entityId: string,
        @Body() dto: CreateFieldDto,
    ) {
        const field = await this.fieldsService.create(entityId, dto);
        return returnValidResponse('Campul a fost creat cu succes.', field);
    }

    @Put(':fieldId')
    async update (
        @Param('entityId') entityId: string,
        @Param('fieldId') fieldId: string,
        @Body() dto: UpdateFieldDto,
    ) {
        const field = await this.fieldsService.update(entityId, fieldId, dto);
        return returnValidResponse('Campul a fost actualizat cu succes.', field);
    }

    @Delete(':fieldId')
    async remove(
        @Param('entityId') entityId: string,
        @Param('fieldId') fieldId: string,
    ) {
        const result = await this.fieldsService.remove(entityId, fieldId);
        return returnValidResponse(result.message, null);
    }
}
