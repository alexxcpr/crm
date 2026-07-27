import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CapabilityGuard } from 'src/security/capability.guard';
import { RequireCapability } from 'src/security/require-capability.decorator';
import type { AuthenticatedUser } from 'src/security/security.types';
import { UpdateAccessLevelDto } from '../dto/update-access-level.dto';
import { AdminSecurityService } from './admin-security.service';

@Controller('v1/admin/security')
@UseGuards(AuthGuard('jwt'), CapabilityGuard)
@RequireCapability('tenant.manage')
export class AdminSecurityController {
  constructor(private readonly service: AdminSecurityService) {}

  @Get('users')
  listUsers(@Req() req: { user: AuthenticatedUser }) {
    return this.service.listUsers(req.user);
  }

  @Post('users')
  createUser(
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.createUser(body, req.user);
  }

  @Post('users/:userId/profiles')
  createProfile(
    @Param('userId') userId: string,
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.createProfile(
      userId,
      body,
      req.user,
    );
  }

  @Put('profiles/:profileId')
  updateProfile(
    @Param('profileId') profileId: string,
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.updateProfile(
      profileId,
      body,
      req.user,
    );
  }

  @Put('profiles/:profileId/access-level')
  @RequireCapability('access_levels.manage')
  updateAccessLevel(
    @Param('profileId') profileId: string,
    @Body() dto: UpdateAccessLevelDto,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.updateAccessLevel(
      profileId,
      dto.accessLevel,
      req.user,
    );
  }

  @Get('entity-catalog')
  entityCatalog() {
    return this.service.entityCatalog();
  }

  @Get('role-groups')
  listRoleGroups(@Req() req: { user: AuthenticatedUser }) {
    return this.service.listRoleGroups(req.user);
  }
  @Post('role-groups')
  createRoleGroup(
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.createRoleGroup(body, req.user);
  }
  @Put('role-groups/:roleGroupId')
  updateRoleGroup(
    @Param('roleGroupId') roleGroupId: string,
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.updateRoleGroup(roleGroupId, body, req.user);
  }
  @Delete('role-groups/:roleGroupId') deleteRoleGroup(@Param('roleGroupId') roleGroupId: string) { return this.service.deleteRoleGroup(roleGroupId); }
  @Post('role-groups/:roleGroupId/apply')
  applyRoleGroup(
    @Param('roleGroupId') roleGroupId: string,
    @Body() body: any,
    @Req() req: { user: AuthenticatedUser },
  ) {
    return this.service.applyRoleGroup(roleGroupId, body, req.user);
  }
  @Get('roles') listRoles() { return this.service.listRoles(); }
  @Post('roles') createRole(@Body() body: any) { return this.service.createRole(body); }
  @Put('roles/:roleId') updateRole(@Param('roleId') roleId: string, @Body() body: any) { return this.service.updateRole(roleId, body); }
  @Delete('roles/:roleId') deleteRole(@Param('roleId') roleId: string) { return this.service.deleteRole(roleId); }
}
