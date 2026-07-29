import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { RelatedDataService } from './related-data.service';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller(
  'v1/data/:parentSlug/:parentId/related',
)
@UseGuards(AuthGuard('jwt'))
export class RelatedDataController {
  constructor(
    private readonly related: RelatedDataService,
  ) {}

  @Get(':collectionSlug')
  findAll(
    @Param('parentSlug') parentSlug: string,
    @Param('parentId') parentId: string,
    @Param('collectionSlug')
    collectionSlug: string,
    @Query() query: Record<string, any>,
    @Req() req: RequestWithUser,
  ) {
    return this.related.findAll(
      parentSlug,
      parentId,
      collectionSlug,
      query,
      req.user,
    );
  }

  @Post(':collectionSlug')
  async create(
    @Param('parentSlug') parentSlug: string,
    @Param('parentId') parentId: string,
    @Param('collectionSlug')
    collectionSlug: string,
    @Body() body: Record<string, any>,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.related.create(
      parentSlug,
      parentId,
      collectionSlug,
      body,
      req.user,
    );
    return returnValidResponse(
      'Inregistrarea asociata a fost creata.',
      result.data,
    );
  }

  @Put(':collectionSlug/:childId')
  async update(
    @Param('parentSlug') parentSlug: string,
    @Param('parentId') parentId: string,
    @Param('collectionSlug')
    collectionSlug: string,
    @Param('childId') childId: string,
    @Body() body: Record<string, any>,
    @Req() req: RequestWithUser,
  ) {
    const result = await this.related.update(
      parentSlug,
      parentId,
      collectionSlug,
      childId,
      body,
      req.user,
    );
    return returnValidResponse(
      'Inregistrarea asociata a fost actualizata.',
      result.data,
    );
  }

  @Delete(':collectionSlug/:childId')
  async remove(
    @Param('parentSlug') parentSlug: string,
    @Param('parentId') parentId: string,
    @Param('collectionSlug')
    collectionSlug: string,
    @Param('childId') childId: string,
    @Req() req: RequestWithUser,
  ) {
    await this.related.remove(
      parentSlug,
      parentId,
      collectionSlug,
      childId,
      req.user,
    );
    return returnValidResponse(
      'Inregistrarea asociata a fost stearsa.',
      null,
    );
  }
}
