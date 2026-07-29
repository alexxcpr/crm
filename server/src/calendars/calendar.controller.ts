import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CalendarQueryService } from './calendar-query.service';
import { CalendarService } from './calendar.service';
import {
  CalendarQueryDto,
  UpdateCalendarIntervalDto,
} from './dto/calendar.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('v1/calendars')
@UseGuards(AuthGuard('jwt'))
export class CalendarController {
  constructor(
    private readonly calendars: CalendarService,
    private readonly queries: CalendarQueryService,
  ) {}

  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Detalii calendar.',
      await this.calendars.findBySlugPublic(
        slug,
        req.user,
      ),
    );
  }

  @Post(':slug/query')
  async query(
    @Param('slug') slug: string,
    @Body() dto: CalendarQueryDto,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Evenimente calendar.',
      await this.queries.query(
        slug,
        dto,
        req.user,
      ),
    );
  }

  @Patch(
    ':slug/sources/:sourceId/events/:recordId/interval',
  )
  async updateInterval(
    @Param('slug') slug: string,
    @Param('sourceId') sourceId: string,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateCalendarIntervalDto,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Intervalul a fost actualizat.',
      await this.queries.updateInterval(
        slug,
        sourceId,
        recordId,
        dto,
        req.user,
      ),
    );
  }
}
