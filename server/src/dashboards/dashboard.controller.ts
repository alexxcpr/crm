import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { DashboardQueryService } from './dashboard-query.service';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dto/dashboard.dto';

interface RequestWithUser extends Request { user: AuthenticatedUser }

@Controller('v1/dashboards')
@UseGuards(AuthGuard('jwt'))
export class DashboardController {
  constructor(
    private readonly dashboards: DashboardService,
    private readonly queries: DashboardQueryService,
  ) {}

  @Get('default')
  async findDefault(@Req() req: RequestWithUser) {
    return returnValidResponse('Dashboard implicit.', await this.dashboards.findDefaultPublic(req.user));
  }

  @Get(':slug')
  async findOne(@Param('slug') slug: string, @Req() req: RequestWithUser) {
    return returnValidResponse('Detalii dashboard.', await this.dashboards.findBySlugPublic(slug, req.user));
  }

  @Post(':slug/query')
  async query(
    @Param('slug') slug: string,
    @Body() dto: DashboardQueryDto,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse('Date dashboard.', await this.queries.query(slug, dto, req.user));
  }
}
