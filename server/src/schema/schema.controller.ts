import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { SchemaService } from './schema.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthenticatedUser } from 'src/security/security.types';

@Controller('v1/schema')
@UseGuards(AuthGuard('jwt'))
export class SchemaController {
    constructor(private readonly schemaService: SchemaService) {}

    @Get(':entitySlug')
    getEntitySchema(@Param('entitySlug') entitySlug: string, @Req() req: Request & { user: AuthenticatedUser }) {
        return this.schemaService.getEntitySchema(entitySlug, req.user);
    }
}
