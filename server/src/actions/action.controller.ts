import {
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { returnValidResponse } from 'src/utils/crud.utils';
import { ActionService } from './action.service';
import { AuthenticatedUser } from 'src/security/security.types';

interface RequestWithUser extends Request { user: AuthenticatedUser }

@Controller('v1/actions')
@UseGuards(AuthGuard('jwt'))
export class ActionController {
  constructor(private readonly actionService: ActionService) {}

  @Get(':entitySlug')
  async getActionsForEntity(@Param('entitySlug') entitySlug: string, @Req() req: RequestWithUser) {
    return this.actionService.findByEntitySlug(entitySlug, req.user);
  }

  @Post(':entitySlug/:actionSlug/execute')
  async execute(
    @Param('entitySlug') entitySlug: string,
    @Param('actionSlug') actionSlug: string,
    @Req() req: RequestWithUser & { body: { recordId: string } },
  ) {
    const { recordId } = req.body;
    const result = await this.actionService.executeManual(
      entitySlug,
      actionSlug,
      recordId,
      req.user,
    );
    return returnValidResponse('Actiunea a fost executata cu succes.', result);
  }
}
