import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { SchemaService } from './schema.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('v1/schema')
@UseGuards(AuthGuard('jwt'))
export class SchemaController {
    constructor(private readonly schemaService: SchemaService) {}

    @Get(':entitySlug')
    getEntitySchema(@Param('entitySlug') entitySlug: string) {
        return this.schemaService.getEntitySchema(entitySlug);
    }
}
