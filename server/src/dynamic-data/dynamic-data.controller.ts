import { Body, Controller, Get, Post, Put, Param, Delete, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DynamicDataService } from './dynamic-data.service';

@Controller('v1/data')
//TODO: DE decomentat asta ca sa am rute protejate
// @UseGuards(AuthGuard('jwt'))
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
    create (
        @Param('entitySlug') entitySlug: string,
        @Body() body: Record<string, any>,
    ) {
        return this.dataService.create(entitySlug, body);
    }

    @Put(':entitySlug/:id')
    update (
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
        @Body() body: Record<string, any>
    ) {
        return this.dataService.update(entitySlug, id, body);
    }

    @Delete(':entitySlug/:id')
    remove(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
    ) {
        return this.dataService.remove(entitySlug, id);
    }
}
