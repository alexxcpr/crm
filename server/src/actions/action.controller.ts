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

interface RequestWithUser extends Request {
  user: { id: string; email: string };
}

@Controller('v1/actions')
@UseGuards(AuthGuard('jwt'))
export class ActionController {
  constructor(private readonly actionService: ActionService) {}

  @Get(':entitySlug')
  async getActionsForEntity(@Param('entitySlug') entitySlug: string) {
    return this.actionService.findByEntitySlug(entitySlug);
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
      req.user.id,
    );
    return returnValidResponse('Actiunea a fost executata cu succes.', result);
  }
}
