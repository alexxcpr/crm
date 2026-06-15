import { Body, Controller, Get, Post, Put, Param, Delete, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { returnValidResponse } from 'src/utils/crud.utils';
import { DynamicDataService } from './dynamic-data.service';
import { AuthenticatedUser } from 'src/security/security.types';

interface RequestWithUser extends Request { user: AuthenticatedUser }

@Controller('v1/data')
@UseGuards(AuthGuard('jwt'))
export class DynamicDataController {
    constructor(private readonly dataService: DynamicDataService) {}

    @Get(':entitySlug')
    findAll(
        @Param('entitySlug') entitySlug: string,
        @Query() query: Record<string, any>,
        @Req() req: RequestWithUser,
    ) {
        return this.dataService.findAll(entitySlug, query, req.user);
    }

    @Get(':entitySlug/:id')
    findOne(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
        @Req() req: RequestWithUser,
    ) {
        return this.dataService.findOne(entitySlug, id, req.user);
    }

    @Post(':entitySlug')
    async create(
        @Param('entitySlug') entitySlug: string,
        @Body() body: Record<string, any>,
        @Req() req: RequestWithUser,
    ) {
        const result = await this.dataService.create(entitySlug, body, req.user);
        return returnValidResponse('Inregistrarea a fost creata cu succes.', result.data);
    }

    @Put(':entitySlug/:id')
    async update(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
        @Body() body: Record<string, any>,
        @Req() req: RequestWithUser,
    ) {
        const result = await this.dataService.update(entitySlug, id, body, req.user);
        return returnValidResponse('Inregistrarea a fost actualizata cu succes.', result.data);
    }

    @Delete(':entitySlug/:id')
    async remove(
        @Param('entitySlug') entitySlug: string,
        @Param('id') id: string,
        @Req() req: RequestWithUser,
    ) {
        await this.dataService.remove(entitySlug, id, req.user);
        return returnValidResponse('Inregistrarea a fost stearsa cu succes.', null);
    }
}
