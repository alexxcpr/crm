import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthenticatedUser } from 'src/security/security.types';
import { ListNotificationsQueryDto, UpdateNotificationReadDto } from './dto';
import { NotificationsService } from './notifications.service';

@Controller('v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  findAll(
    @Req() req: Request & { user: AuthenticatedUser },
    @Query() query: ListNotificationsQueryDto,
  ) {
    return this.notifications.findAll(req.user.profileId, query);
  }

  @Get('unread-count')
  unreadCount(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.notifications.unreadCount(req.user.profileId);
  }

  @Patch('read-all')
  markAllRead(@Req() req: Request & { user: AuthenticatedUser }) {
    return this.notifications.markAllRead(req.user.profileId);
  }

  @Patch(':id/read')
  setRead(
    @Req() req: Request & { user: AuthenticatedUser },
    @Param('id') id: string,
    @Body() dto: UpdateNotificationReadDto,
  ) {
    return this.notifications.setRead(req.user.profileId, id, dto.isRead);
  }
}
