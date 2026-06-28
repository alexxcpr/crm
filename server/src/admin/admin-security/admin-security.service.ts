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
    if (Array.isArray(body.roleIds) && current.is_active) await this.assertAdminCoverageAfterRoleReplacement([profileId], body.roleIds);
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

  async listRoleGroups() {
    const groups = await this.knex('role_group').orderBy('name');
    for (const group of groups) {
      group.roles = await this.knex('role_group_role')
        .join('role', 'role_group_role.id_role', 'role.id_role')
        .where('role_group_role.id_role_group', group.id_role_group)
        .select('role.id_role', 'role.name', 'role.slug', 'role.is_system')
        .orderBy('role.name');
      group.profiles = await this.knex('role_group_profile')
        .join('profile', 'role_group_profile.id_profile', 'profile.id_profile')
        .leftJoin('user', 'profile.id_user', 'user.id')
        .where('role_group_profile.id_role_group', group.id_role_group)
        .select('profile.id_profile', 'profile.username', 'profile.email', 'profile.display_name', 'profile.is_active', 'user.login_username')
        .orderBy('profile.date_created');
    }
    return groups;
  }

  async createRoleGroup(body: any) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Numele grupului este obligatoriu.');
    try {
      const [group] = await this.knex.transaction(async (trx) => {
        const [created] = await trx('role_group').insert({
          name,
          description: body.description?.trim() || null,
        }).returning('*');
        await this.replaceRoleGroupLinks(created.id_role_group, body.roleIds ?? [], body.profileIds ?? [], trx);
        return [created];
      });
      return (await this.listRoleGroups()).find((item) => item.id_role_group === group.id_role_group);
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Exista deja un role group cu acest nume.');
      throw error;
    }
  }

  async updateRoleGroup(roleGroupId: string, body: any) {
    const group = await this.knex('role_group').where('id_role_group', roleGroupId).first();
    if (!group) throw new NotFoundException('Role group-ul nu exista.');
    try {
      await this.knex.transaction(async (trx) => {
        await trx('role_group').where('id_role_group', roleGroupId).update({
          name: body.name?.trim() || group.name,
          description: body.description !== undefined ? body.description?.trim() || null : group.description,
          date_updated: new Date(),
        });
        if (Array.isArray(body.roleIds) || Array.isArray(body.profileIds)) {
          const roleIds = Array.isArray(body.roleIds)
            ? body.roleIds
            : (await trx('role_group_role').where('id_role_group', roleGroupId).pluck('id_role'));
          const profileIds = Array.isArray(body.profileIds)
            ? body.profileIds
            : (await trx('role_group_profile').where('id_role_group', roleGroupId).pluck('id_profile'));
          await this.replaceRoleGroupLinks(roleGroupId, roleIds, profileIds, trx);
        }
      });
      return (await this.listRoleGroups()).find((item) => item.id_role_group === roleGroupId);
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Exista deja un role group cu acest nume.');
      throw error;
    }
  }

  async deleteRoleGroup(roleGroupId: string) {
    const group = await this.knex('role_group').where('id_role_group', roleGroupId).first();
    if (!group) throw new NotFoundException('Role group-ul nu exista.');
    await this.knex('role_group').where('id_role_group', roleGroupId).del();
  }

  async applyRoleGroup(roleGroupId: string, body: any) {
    const mode = body.mode === 'replace' ? 'replace' : body.mode === 'add' ? 'add' : null;
    if (!mode) throw new BadRequestException('Modul de aplicare trebuie sa fie add sau replace.');

    const group = await this.knex('role_group').where('id_role_group', roleGroupId).first();
    if (!group) throw new NotFoundException('Role group-ul nu exista.');

    const roleIds = await this.knex('role_group_role').where('id_role_group', roleGroupId).pluck('id_role');
    const profileIds = await this.knex('role_group_profile').where('id_role_group', roleGroupId).pluck('id_profile');
    if (!profileIds.length) throw new BadRequestException('Role group-ul nu are profiluri selectate.');

    if (mode === 'replace') await this.assertAdminCoverageAfterRoleReplacement(profileIds, roleIds);

    await this.knex.transaction(async (trx) => {
      if (mode === 'replace') {
        await trx('profile_role').whereIn('id_profile', profileIds).del();
      }
      const rows = profileIds.flatMap((id_profile: string) => roleIds.map((id_role: string) => ({ id_profile, id_role })));
      if (rows.length) await trx('profile_role').insert(rows).onConflict(['id_profile', 'id_role']).ignore();
    });

    return { updatedProfiles: profileIds.length, mode };
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

  private async replaceRoleGroupLinks(roleGroupId: string, roleIds: string[], profileIds: string[], trx: any) {
    const cleanRoleIds = this.uniqueStrings(roleIds);
    const cleanProfileIds = this.uniqueStrings(profileIds);
    await trx('role_group_role').where('id_role_group', roleGroupId).del();
    await trx('role_group_profile').where('id_role_group', roleGroupId).del();
    if (cleanRoleIds.length) {
      await trx('role_group_role').insert(cleanRoleIds.map((id_role) => ({ id_role_group: roleGroupId, id_role })));
    }
    if (cleanProfileIds.length) {
      await trx('role_group_profile').insert(cleanProfileIds.map((id_profile) => ({ id_role_group: roleGroupId, id_profile })));
    }
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

  private async assertAdminCoverageAfterRoleReplacement(profileIds: string[], nextRoleIds: string[]) {
    const cleanProfileIds = this.uniqueStrings(profileIds);
    if (!cleanProfileIds.length) return;

    const nextHasAdmin = nextRoleIds.length
      ? !!(await this.knex('role').whereIn('id_role', this.uniqueStrings(nextRoleIds)).where('slug', 'admin').first())
      : false;
    if (nextHasAdmin) return;

    const activeTargetAdmin = await this.knex('profile')
      .join('profile_role', 'profile.id_profile', 'profile_role.id_profile')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .whereIn('profile.id_profile', cleanProfileIds)
      .where({ 'profile.is_active': true, 'role.slug': 'admin' })
      .first('profile.id_profile');
    if (!activeTargetAdmin) return;

    const [{ count }] = await this.knex('profile')
      .join('profile_role', 'profile.id_profile', 'profile_role.id_profile')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .where({ 'profile.is_active': true, 'role.slug': 'admin' })
      .whereNotIn('profile.id_profile', cleanProfileIds)
      .countDistinct('profile.id_profile as count');
    if (Number(count) === 0) throw new BadRequestException('Ultimul profil administrator activ nu poate pierde rolul admin.');
  }

  private normalize(value?: string) { return value?.trim().toLowerCase(); }

  private uniqueStrings(values: string[]) {
    return [...new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0))];
  }
}
