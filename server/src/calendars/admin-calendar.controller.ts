import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ReorderDto } from 'src/admin/dto/reorder.dto';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import type { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { CalendarQueryService } from './calendar-query.service';
import { CalendarService } from './calendar.service';
import {
  PreviewCalendarDto,
  SaveCalendarDto,
} from './dto/calendar.dto';

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@Controller('v1/admin/calendars')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('builder.manage')
export class AdminCalendarController {
  constructor(
    private readonly calendars: CalendarService,
    private readonly queries: CalendarQueryService,
  ) {}

  @Get('catalog')
  async catalog() {
    return returnValidResponse(
      'Catalog calendare.',
      await this.calendars.catalog(),
    );
  }

  @Post('preview/query')
  async preview(
    @Body() dto: PreviewCalendarDto,
    @Req() req: RequestWithUser,
  ) {
    return returnValidResponse(
      'Preview calendar.',
      await this.queries.preview(dto, req.user),
    );
  }

  @Put('reorder/ranks')
  async reorder(@Body() dto: ReorderDto) {
    return returnValidResponse(
      'Ordinea calendarelor a fost actualizată.',
      await this.calendars.reorder(dto.items),
    );
  }

  @Get()
  async findAll() {
    return returnValidResponse(
      'Lista calendarelor.',
      await this.calendars.findAllAdmin(),
    );
  }

  @Post()
  async create(@Body() dto: SaveCalendarDto) {
    return returnValidResponse(
      'Calendarul a fost creat.',
      await this.calendars.create(dto),
    );
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return returnValidResponse(
      'Detalii calendar.',
      await this.calendars.findOneAdmin(id),
    );
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: SaveCalendarDto,
  ) {
    return returnValidResponse(
      'Calendarul a fost actualizat.',
      await this.calendars.update(id, dto),
    );
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result =
      await this.calendars.remove(id);
    return returnValidResponse(
      result.message,
      null,
    );
  }
}
