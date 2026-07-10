import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { AuthenticatedUser } from 'src/security/security.types';
import { returnValidResponse } from 'src/utils/crud.utils';
import { NavigationMenuService } from './navigation-menu.service';

@Controller('v1/navigation')
@UseGuards(AuthGuard('jwt'))
export class NavigationMenuController {
  constructor(private readonly navigationMenuService: NavigationMenuService) {}

  @Get('menu')
  async getMenu(@Req() req: Request & { user: AuthenticatedUser }) {
    const menu = await this.navigationMenuService.getMenu(req.user);
    return returnValidResponse('Meniul de navigare.', menu);
  }
}
