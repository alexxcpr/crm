import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from 'src/guards/roles.decorator';
import { RolesGuard } from 'src/guards/roles.guard';
import { AdminSecurityService } from './admin-security.service';

@Controller('v1/admin/security')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('admin')
export class AdminSecurityController {
  constructor(private readonly service: AdminSecurityService) {}

  @Get('users') listUsers() { return this.service.listUsers(); }
  @Post('users') createUser(@Body() body: any) { return this.service.createUser(body); }
  @Post('users/:userId/profiles') createProfile(@Param('userId') userId: string, @Body() body: any) { return this.service.createProfile(userId, body); }
  @Put('profiles/:profileId') updateProfile(@Param('profileId') profileId: string, @Body() body: any) { return this.service.updateProfile(profileId, body); }
  @Get('roles') listRoles() { return this.service.listRoles(); }
  @Post('roles') createRole(@Body() body: any) { return this.service.createRole(body); }
  @Put('roles/:roleId') updateRole(@Param('roleId') roleId: string, @Body() body: any) { return this.service.updateRole(roleId, body); }
  @Delete('roles/:roleId') deleteRole(@Param('roleId') roleId: string) { return this.service.deleteRole(roleId); }
}
