import { BadRequestException, Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import * as argon from 'argon2';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { AuthorizationService } from 'src/security/authorization.service';

@Controller('user')
@UseGuards(AuthGuard('jwt'))
export class UserController {
  constructor(private readonly tenantContext: TenantContext, private readonly authorization: AuthorizationService) {}

  @Get('me')
  async getSession(@Req() req: Request & { user: AuthenticatedUser }) {
    const user = req.user;
    const profiles = await this.tenantContext.knex('profile')
      .where({ id_user: user.id, is_active: true })
      .select('id_profile', 'username', 'email', 'display_name', 'is_default')
      .orderBy([{ column: 'is_default', order: 'desc' }, { column: 'display_name', order: 'asc' }]);
    const entities = await this.tenantContext.knex('entity').select('id_entity', 'slug');
    const capabilities: Record<string, unknown> = {};
    for (const entity of entities) capabilities[entity.slug] = await this.authorization.capabilities(user, entity.id_entity);
    return { ...user, profiles, capabilities };
  }

  @Get('profiles/active')
  async activeProfiles() {
    return this.tenantContext.knex('profile')
      .where('is_active', true)
      .select('id_profile', 'display_name', 'username', 'email')
      .orderByRaw('COALESCE(display_name, username, email) ASC');
  }

  @Put('me/profile')
  async updateProfile(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: { username?: string; email?: string; displayName?: string | null },
  ) {
    const patch: Record<string, unknown> = { date_updated: new Date() };
    if (body.username !== undefined) patch.username = body.username.trim().toLowerCase();
    if (body.email !== undefined) patch.email = body.email.trim().toLowerCase();
    if (body.displayName !== undefined) patch.display_name = body.displayName?.trim() || null;
    try {
      const [profile] = await this.tenantContext.knex('profile').where('id_profile', req.user.profileId).update(patch).returning('*');
      return { data: profile };
    } catch (error: any) {
      if (error.code === '23505') throw new BadRequestException('Username-ul sau emailul este deja folosit.');
      throw error;
    }
  }

  @Put('me/default-profile')
  async setDefault(@Req() req: Request & { user: AuthenticatedUser }, @Body('profileId') profileId: string) {
    const knex = this.tenantContext.knex;
    const profile = await knex('profile').where({ id_profile: profileId, id_user: req.user.id, is_active: true }).first();
    if (!profile) throw new BadRequestException('Profil invalid.');
    await knex.transaction(async (trx) => {
      await trx('profile').where('id_user', req.user.id).update({ is_default: false });
      await trx('profile').where('id_profile', profileId).update({ is_default: true });
    });
    return { success: true };
  }

  @Put('me/account')
  async updateAccount(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: { loginUsername: string; currentPassword: string },
  ) {
    const knex = this.tenantContext.knex;
    const user = await knex('user').where('id', req.user.id).first();
    if (!(await argon.verify(user.hash, body.currentPassword))) throw new BadRequestException('Parola curenta este incorecta.');
    await knex('user').where('id', user.id).update({ login_username: body.loginUsername.trim().toLowerCase(), date_updated: new Date() });
    await knex('refresh_token').where('user_id', user.id).update({ is_revoked: true });
    return { success: true, reauthenticate: true };
  }

  @Put('me/password')
  async updatePassword(
    @Req() req: Request & { user: AuthenticatedUser },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    if (!body.newPassword) throw new BadRequestException('Parola noua este obligatorie.');
    const knex = this.tenantContext.knex;
    const user = await knex('user').where('id', req.user.id).first();
    if (!(await argon.verify(user.hash, body.currentPassword))) throw new BadRequestException('Parola curenta este incorecta.');
    await knex('user').where('id', user.id).update({ hash: await argon.hash(body.newPassword), must_change_password: false, date_updated: new Date() });
    await knex('refresh_token').where('user_id', user.id).update({ is_revoked: true });
    return { success: true, reauthenticate: true };
  }
}
