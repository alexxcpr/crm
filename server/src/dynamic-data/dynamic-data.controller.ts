import { Body, Controller, Get, Post, Put, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { returnValidResponse } from 'src/utils/crud.utils';
import { DynamicDataService } from './dynamic-data.service';

@Controller('v1/data')
@UseGuards(AuthGuard('jwt'))
export class DynamicDataController {
    constructor(private readonly dataService: DynamicDataService) {}

    @Get(':entitySlug')
    findAll(
        @Param('entitySlug') entitySlug: string,
        @Query() query: Record<string, any>,
    ) {
        return this.dataService.findAll(entitySlug, query);
    }

    @Get(':entitySlug/:id')
    findOne(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
    ) {
        return this.dataService.findOne(entitySlug, id);
    }

    @Post(':entitySlug')
    async create(
        @Param('entitySlug') entitySlug: string,
        @Body() body: Record<string, any>,
    ) {
        const result = await this.dataService.create(entitySlug, body);
        return returnValidResponse('Inregistrarea a fost creata cu succes.', result.data);
    }

    @Put(':entitySlug/:id')
    async update(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
        @Body() body: Record<string, any>,
    ) {
        const result = await this.dataService.update(entitySlug, id, body);
        return returnValidResponse('Inregistrarea a fost actualizata cu succes.', result.data);
    }

    @Delete(':entitySlug/:id')
    async remove(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
    ) {
        await this.dataService.remove(entitySlug, id);
        return returnValidResponse('Inregistrarea a fost stearsa cu succes.', null);
    }
}
