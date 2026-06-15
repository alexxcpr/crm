import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon from 'argon2';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { BillingApiClient } from 'src/tenant/billing-api.client';

@Injectable()
export class AdminSecurityService {
  constructor(private readonly tenantContext: TenantContext, private readonly billing: BillingApiClient) {}
  private get knex() { return this.tenantContext.knex; }

  async listUsers() {
    const users = await this.knex('user').select('id', 'login_username', 'must_change_password', 'is_active', 'date_created').orderBy('date_created');
    for (const user of users) user.profiles = await this.profileQuery().where('profile.id_user', user.id);
    return users;
  }

  async createUser(body: any) {
    await this.assertProfileCapacity();
    const loginUsername = this.normalize(body.loginUsername);
    const profileUsername = this.normalize(body.profile?.username);
    const email = this.normalize(body.profile?.email);
    if (!loginUsername || !profileUsername || !email || !body.temporaryPassword) throw new BadRequestException('Datele contului si profilului sunt obligatorii.');
    if (body.temporaryPassword.length < 8) throw new BadRequestException('Parola temporara trebuie sa aiba minimum 8 caractere.');
    try {
      return await this.knex.transaction(async (trx) => {
        const [user] = await trx('user').insert({
          login_username: loginUsername,
          hash: await argon.hash(body.temporaryPassword),
          must_change_password: true,
          is_active: true,
        }).returning(['id', 'login_username', 'must_change_password', 'is_active']);
        const [profile] = await trx('profile').insert({
          id_user: user.id,
          username: profileUsername,
          email,
          display_name: body.profile.displayName?.trim() || null,
          is_default: true,
          is_active: true,
        }).returning('*');
        if (body.profile.roleIds?.length) {
          await trx('profile_role').insert(body.profile.roleIds.map((id_role: string) => ({ id_profile: profile.id_profile, id_role })));
        }
        return { ...user, profiles: [{ ...profile, roles: [] }] };
      });
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Login username, username-ul profilului sau emailul exista deja.');
      throw error;
    }
  }

  async createProfile(userId: string, body: any) {
    await this.assertProfileCapacity();
    const user = await this.knex('user').where('id', userId).first();
    if (!user) throw new NotFoundException('Userul nu exista.');
    try {
      return await this.knex.transaction(async (trx) => {
        const hasDefault = await trx('profile').where({ id_user: userId, is_default: true }).first();
        const [profile] = await trx('profile').insert({
          id_user: userId,
          username: this.normalize(body.username),
          email: this.normalize(body.email),
          display_name: body.displayName?.trim() || null,
          is_default: !hasDefault,
          is_active: true,
        }).returning('*');
        if (body.roleIds?.length) await trx('profile_role').insert(body.roleIds.map((id_role: string) => ({ id_profile: profile.id_profile, id_role })));
        return profile;
      });
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Username-ul sau emailul profilului exista deja.');
      throw error;
    }
  }

  async updateProfile(profileId: string, body: any) {
    const current = await this.knex('profile').where('id_profile', profileId).first();
    if (!current) throw new NotFoundException('Profilul nu exista.');
    if (body.isActive === true && !current.is_active) await this.assertProfileCapacity();
    if (body.isActive === false && current.is_active) await this.assertNotLastAdmin(profileId);
    return this.knex.transaction(async (trx) => {
      const [profile] = await trx('profile').where('id_profile', profileId).update({
        username: body.username ? this.normalize(body.username) : current.username,
        email: body.email ? this.normalize(body.email) : current.email,
        display_name: body.displayName !== undefined ? body.displayName?.trim() || null : current.display_name,
        is_active: body.isActive ?? current.is_active,
        date_updated: new Date(),
      }).returning('*');
      if (Array.isArray(body.roleIds)) {
        await trx('profile_role').where('id_profile', profileId).del();
        if (body.roleIds.length) await trx('profile_role').insert(body.roleIds.map((id_role: string) => ({ id_profile: profileId, id_role })));
      }
      return profile;
    });
  }

  async listRoles() {
    const roles = await this.knex('role').orderBy('name');
    for (const role of roles) role.permissions = await this.knex('role_permission').where('id_role', role.id_role).orderBy(['id_entity', 'action']);
    return roles;
  }

  async createRole(body: any) {
    const [role] = await this.knex('role').insert({ name: body.name, slug: this.normalize(body.slug), description: body.description || null, is_system: false }).returning('*');
    await this.replacePermissions(role.id_role, body.permissions ?? []);
    return { ...role, permissions: await this.knex('role_permission').where('id_role', role.id_role) };
  }

  async updateRole(roleId: string, body: any) {
    const role = await this.knex('role').where('id_role', roleId).first();
    if (!role) throw new NotFoundException('Rolul nu exista.');
    await this.knex('role').where('id_role', roleId).update({ name: body.name ?? role.name, description: body.description ?? role.description, date_updated: new Date() });
    if (body.permissions) await this.replacePermissions(roleId, body.permissions);
    return (await this.listRoles()).find((item) => item.id_role === roleId);
  }

  async deleteRole(roleId: string) {
    const role = await this.knex('role').where('id_role', roleId).first();
    if (!role) throw new NotFoundException('Rolul nu exista.');
    if (role.is_system) throw new BadRequestException('Rolurile de sistem nu pot fi sterse.');
    await this.knex('role').where('id_role', roleId).del();
  }

  private profileQuery() {
    return this.knex('profile')
      .select('profile.*', this.knex.raw("COALESCE(json_agg(json_build_object('id_role', role.id_role, 'name', role.name, 'slug', role.slug)) FILTER (WHERE role.id_role IS NOT NULL), '[]') as roles"))
      .leftJoin('profile_role', 'profile.id_profile', 'profile_role.id_profile')
      .leftJoin('role', 'profile_role.id_role', 'role.id_role')
      .groupBy('profile.id_profile')
      .orderBy('profile.date_created');
  }

  private async replacePermissions(roleId: string, permissions: any[]) {
    const validActions = new Set(['read', 'create', 'update', 'delete', 'manage', 'change_ownership']);
    await this.knex.transaction(async (trx) => {
      await trx('role_permission').where('id_role', roleId).del();
      const rows = permissions.filter((p) => p.idEntity && validActions.has(p.action)).map((p) => ({
        id_role: roleId,
        id_entity: p.idEntity,
        action: p.action,
        scope: ['read', 'update', 'delete', 'manage'].includes(p.action) ? (p.scope === 'owner' ? 'owner' : 'all') : null,
      }));
      if (rows.length) await trx('role_permission').insert(rows);
    });
  }

  private async assertProfileCapacity() {
    const tenant = await this.billing.getCompanyBySlug(this.tenantContext.slug);
    const [{ count }] = await this.knex('profile').where('is_active', true).count('* as count');
    if (tenant && Number(count) >= tenant.maxUsers) throw new BadRequestException(`Limita de ${tenant.maxUsers} profiluri active a fost atinsa.`);
  }

  private async assertNotLastAdmin(profileId: string) {
    const isAdmin = await this.knex('profile_role').join('role', 'profile_role.id_role', 'role.id_role').where({ 'profile_role.id_profile': profileId, 'role.slug': 'admin' }).first();
    if (!isAdmin) return;
    const [{ count }] = await this.knex('profile')
      .join('profile_role', 'profile.id_profile', 'profile_role.id_profile')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .where({ 'profile.is_active': true, 'role.slug': 'admin' })
      .whereNot('profile.id_profile', profileId)
      .countDistinct('profile.id_profile as count');
    if (Number(count) === 0) throw new BadRequestException('Ultimul profil administrator activ nu poate fi dezactivat.');
  }

  private normalize(value?: string) { return value?.trim().toLowerCase(); }
}
