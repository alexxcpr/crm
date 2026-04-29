import { Controller, UseGuards, Get, Req, Param, NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { TenantContext } from 'src/tenant/tenant-context.service';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly tenantContext: TenantContext) {}

  @Get('me')
  getProfile(@Req() req: Request) {
    return (req as any).user;
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    const knex = this.tenantContext.knex;

    const user = await knex('user')
      .select('id', 'email', 'first_name', 'last_name')
      .where('id', id)
      .first();

    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
