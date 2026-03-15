import { Controller, Get, Param } from '@nestjs/common';
import { SchemaService } from './schema.service';

@Controller('v1/schema')
export class SchemaController {
    constructor(private readonly schemaService: SchemaService) {}

    @Get(':entitySlug')
    getEntitySchema(@Param('entitySlug') entitySlug: string) {
        return this.schemaService.getEntitySchema(entitySlug);
    }
}
