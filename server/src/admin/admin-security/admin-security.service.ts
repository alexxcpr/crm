import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon from 'argon2';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { BillingApiClient } from 'src/tenant/billing-api.client';
import { AccessControlService } from 'src/security/access-control.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantAuditService } from 'src/security/tenant-audit.service';
import type { AccessLevel } from 'src/security/access-control.types';

@Injectable()
export class AdminSecurityService {
  private static readonly RESERVED_ROLE_SLUGS =
    new Set([
      'admin',
      'platform_owner',
      'tenant_admin',
    ]);

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly billing: BillingApiClient,
    private readonly access: AccessControlService,
    private readonly audit: TenantAuditService,
  ) {}
  private get knex() { return this.tenantContext.knex; }

  async listUsers(actor: AuthenticatedUser) {
    const includePlatformOwners = this.access.has(
      actor,
      'access_levels.manage',
    );
    const users = await this.knex('user').select('id', 'login_username', 'must_change_password', 'is_active', 'date_created').orderBy('date_created');
    for (const user of users) {
      user.profiles = await this.profileQuery(
        includePlatformOwners,
      ).where('profile.id_user', user.id);
    }
    return includePlatformOwners
      ? users
      : users.filter(
          (user) => user.profiles.length > 0,
        );
  }

  async createUser(body: any, actor: AuthenticatedUser) {
    await this.assertProfileCapacity();
    const loginUsername = this.normalize(body.loginUsername);
    const profileUsername = this.normalize(body.profile?.username);
    const email = this.normalize(body.profile?.email);
    if (!loginUsername || !profileUsername || !email || !body.temporaryPassword) throw new BadRequestException('Datele contului si profilului sunt obligatorii.');
    if (body.temporaryPassword.length < 8) throw new BadRequestException('Parola temporara trebuie sa aiba minimum 8 caractere.');
    await this.assertBusinessRoleIds(
      body.profile.roleIds,
    );
    try {
      const result = await this.knex.transaction(async (trx) => {
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
          access_level: 'user',
          is_default: true,
          is_active: true,
        }).returning('*');
        if (body.profile.roleIds?.length) {
          await trx('profile_role').insert(body.profile.roleIds.map((id_role: string) => ({ id_profile: profile.id_profile, id_role })));
        }
        return { ...user, profiles: [{ ...profile, roles: [] }] };
      });
      await this.audit.record({
        actorProfileId: actor.profileId,
        action: 'profile.created',
        targetType: 'profile',
        targetId:
          result.profiles[0].id_profile,
        after: {
          accessLevel: 'user',
          isActive: true,
        },
      });
      return result;
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Login username, username-ul profilului sau emailul exista deja.');
      throw error;
    }
  }

  async createProfile(
    userId: string,
    body: any,
    actor: AuthenticatedUser,
  ) {
    await this.assertProfileCapacity();
    const user = await this.knex('user').where('id', userId).first();
    if (!user) throw new NotFoundException('Userul nu exista.');
    if (
      await this.knex('profile')
        .where({
          id_user: userId,
          access_level: 'platform_owner',
        })
        .first()
    ) {
      throw new ForbiddenException(
        'Contul Platform Owner nu poate avea profiluri suplimentare.',
      );
    }
    await this.assertBusinessRoleIds(body.roleIds);
    try {
      const profile = await this.knex.transaction(async (trx) => {
        const hasDefault = await trx('profile').where({ id_user: userId, is_default: true }).first();
        const [profile] = await trx('profile').insert({
          id_user: userId,
          username: this.normalize(body.username),
          email: this.normalize(body.email),
          display_name: body.displayName?.trim() || null,
          access_level: 'user',
          is_default: !hasDefault,
          is_active: true,
        }).returning('*');
        if (body.roleIds?.length) await trx('profile_role').insert(body.roleIds.map((id_role: string) => ({ id_profile: profile.id_profile, id_role })));
        return profile;
      });
      await this.audit.record({
        actorProfileId: actor.profileId,
        action: 'profile.created',
        targetType: 'profile',
        targetId: profile.id_profile,
        after: {
          accessLevel: 'user',
          isActive: true,
        },
      });
      return profile;
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Username-ul sau emailul profilului exista deja.');
      throw error;
    }
  }

  async updateProfile(
    profileId: string,
    body: any,
    actor: AuthenticatedUser,
  ) {
    const current = await this.knex('profile').where('id_profile', profileId).first();
    if (!current) throw new NotFoundException('Profilul nu exista.');
    await this.assertBusinessRoleIds(body.roleIds);
    const canManageAccess = this.access.has(
      actor,
      'access_levels.manage',
    );
    if (
      current.access_level === 'platform_owner' ||
      (!canManageAccess &&
        current.access_level !== 'user')
    ) {
      throw new ForbiddenException(
        'Profilurile privilegiate pot fi administrate numai de Platform Owner.',
      );
    }
    if (body.isActive === true && !current.is_active) await this.assertProfileCapacity();
    if (
      body.isActive === false &&
      current.is_active
    ) {
      await this.assertNotLastTenantAdmin(
        profileId,
      );
    }
    const result = await this.knex.transaction(async (trx) => {
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
    if (
      body.isActive !== undefined &&
      body.isActive !== current.is_active
    ) {
      await this.audit.record({
        actorProfileId: actor.profileId,
        action: body.isActive
          ? 'profile.activated'
          : 'profile.deactivated',
        targetType: 'profile',
        targetId: profileId,
        before: { isActive: current.is_active },
        after: { isActive: body.isActive },
      });
    }
    return result;
  }

  async updateAccessLevel(
    profileId: string,
    accessLevel: Exclude<
      AccessLevel,
      'platform_owner'
    >,
    actor: AuthenticatedUser,
  ) {
    const current = await this.knex('profile')
      .where('id_profile', profileId)
      .first();
    if (!current)
      throw new NotFoundException(
        'Profilul nu exista.',
      );
    if (
      current.access_level === 'platform_owner'
    ) {
      throw new ForbiddenException(
        'Nivelul Platform Owner este administrat numai prin provisioning.',
      );
    }
    if (
      current.access_level === 'tenant_admin' &&
      accessLevel === 'user'
    ) {
      await this.assertNotLastTenantAdmin(
        profileId,
      );
    }
    if (current.access_level === accessLevel)
      return current;

    const [updated] = await this.knex('profile')
      .where('id_profile', profileId)
      .update({
        access_level: accessLevel,
        date_updated: new Date(),
      })
      .returning('*');
    await this.audit.record({
      actorProfileId: actor.profileId,
      action: 'profile.access_level_changed',
      targetType: 'profile',
      targetId: profileId,
      before: {
        accessLevel: current.access_level,
      },
      after: { accessLevel },
    });
    return updated;
  }

  async entityCatalog() {
    return this.knex('entity as entity')
      .leftJoin(
        'module as module',
        'entity.id_module',
        'module.id_module',
      )
      .select(
        'entity.id_entity',
        'entity.name',
        'entity.slug',
        'entity.id_module',
        'module.name as module_name',
      )
      .orderBy([
        { column: 'module.rank', order: 'asc' },
        { column: 'entity.rank', order: 'asc' },
      ]);
  }

  async listRoleGroups(actor: AuthenticatedUser) {
    const canManageAccess = this.access.has(
      actor,
      'access_levels.manage',
    );
    const groups = await this.knex('role_group').orderBy('name');
    for (const group of groups) {
      group.roles = await this.knex('role_group_role')
        .join('role', 'role_group_role.id_role', 'role.id_role')
        .where('role_group_role.id_role_group', group.id_role_group)
        .whereNotIn('role.slug', [
          ...AdminSecurityService.RESERVED_ROLE_SLUGS,
        ])
        .select('role.id_role', 'role.name', 'role.slug', 'role.is_system')
        .orderBy('role.name');
      const profilesQuery = this.knex('role_group_profile')
        .join('profile', 'role_group_profile.id_profile', 'profile.id_profile')
        .leftJoin('user', 'profile.id_user', 'user.id')
        .where('role_group_profile.id_role_group', group.id_role_group)
        .whereNot(
          'profile.access_level',
          'platform_owner',
        );
      if (!canManageAccess) {
        profilesQuery.where(
          'profile.access_level',
          'user',
        );
      }
      group.profiles = await profilesQuery
        .select('profile.id_profile', 'profile.username', 'profile.email', 'profile.display_name', 'profile.is_active', 'user.login_username')
        .orderBy('profile.date_created');
    }
    return groups;
  }

  async createRoleGroup(
    body: any,
    actor: AuthenticatedUser,
  ) {
    const name = body.name?.trim();
    if (!name) throw new BadRequestException('Numele grupului este obligatoriu.');
    await this.assertBusinessRoleIds(body.roleIds);
    try {
      const [group] = await this.knex.transaction(async (trx) => {
        const [created] = await trx('role_group').insert({
          name,
          description: body.description?.trim() || null,
        }).returning('*');
        await this.replaceRoleGroupLinks(created.id_role_group, body.roleIds ?? [], body.profileIds ?? [], trx, actor);
        return [created];
      });
      return (await this.listRoleGroups(actor)).find((item) => item.id_role_group === group.id_role_group);
    } catch (error: any) {
      if (error.code === '23505') throw new ConflictException('Exista deja un role group cu acest nume.');
      throw error;
    }
  }

  async updateRoleGroup(
    roleGroupId: string,
    body: any,
    actor: AuthenticatedUser,
  ) {
    const group = await this.knex('role_group').where('id_role_group', roleGroupId).first();
    if (!group) throw new NotFoundException('Role group-ul nu exista.');
    await this.assertBusinessRoleIds(body.roleIds);
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
          await this.replaceRoleGroupLinks(roleGroupId, roleIds, profileIds, trx, actor);
        }
      });
      return (await this.listRoleGroups(actor)).find((item) => item.id_role_group === roleGroupId);
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

  async applyRoleGroup(
    roleGroupId: string,
    body: any,
    actor: AuthenticatedUser,
  ) {
    const mode = body.mode === 'replace' ? 'replace' : body.mode === 'add' ? 'add' : null;
    if (!mode) throw new BadRequestException('Modul de aplicare trebuie sa fie add sau replace.');

    const group = await this.knex('role_group').where('id_role_group', roleGroupId).first();
    if (!group) throw new NotFoundException('Role group-ul nu exista.');

    const roleIds = await this.knex('role_group_role').where('id_role_group', roleGroupId).pluck('id_role');
    const profileIds = await this.knex('role_group_profile').where('id_role_group', roleGroupId).pluck('id_profile');
    if (!profileIds.length) throw new BadRequestException('Role group-ul nu are profiluri selectate.');
    await this.assertBusinessRoleIds(roleIds);
    await this.assertManageableProfiles(
      profileIds,
      actor,
      this.knex,
    );

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
    const roles = await this.knex('role')
      .whereNotIn('slug', [
        ...AdminSecurityService.RESERVED_ROLE_SLUGS,
      ])
      .orderBy('name');
    for (const role of roles) role.permissions = await this.knex('role_permission').where('id_role', role.id_role).orderBy(['id_entity', 'action']);
    return roles;
  }

  async createRole(body: any) {
    const slug = this.normalize(body.slug);
    if (
      !slug ||
      AdminSecurityService.RESERVED_ROLE_SLUGS.has(
        slug,
      )
    ) {
      throw new BadRequestException(
        'Slug-ul rolului este rezervat.',
      );
    }
    const [role] = await this.knex('role').insert({ name: body.name, slug, description: body.description || null, is_system: false }).returning('*');
    await this.replacePermissions(role.id_role, body.permissions ?? []);
    return { ...role, permissions: await this.knex('role_permission').where('id_role', role.id_role) };
  }

  async updateRole(roleId: string, body: any) {
    const role = await this.knex('role').where('id_role', roleId).first();
    if (!role) throw new NotFoundException('Rolul nu exista.');
    if (
      AdminSecurityService.RESERVED_ROLE_SLUGS.has(
        role.slug,
      )
    ) {
      throw new BadRequestException(
        'Rolul de sistem legacy nu poate fi modificat.',
      );
    }
    await this.knex('role').where('id_role', roleId).update({ name: body.name ?? role.name, description: body.description ?? role.description, date_updated: new Date() });
    if (body.permissions) await this.replacePermissions(roleId, body.permissions);
    return (await this.listRoles()).find((item) => item.id_role === roleId);
  }

  async deleteRole(roleId: string) {
    const role = await this.knex('role').where('id_role', roleId).first();
    if (!role) throw new NotFoundException('Rolul nu exista.');
    if (
      role.is_system ||
      AdminSecurityService.RESERVED_ROLE_SLUGS.has(
        role.slug,
      )
    )
      throw new BadRequestException('Rolurile de sistem nu pot fi sterse.');
    await this.knex('role').where('id_role', roleId).del();
  }

  private profileQuery(
    includePlatformOwners = false,
  ) {
    const query = this.knex('profile')
      .select('profile.*', this.knex.raw("COALESCE(json_agg(json_build_object('id_role', role.id_role, 'name', role.name, 'slug', role.slug)) FILTER (WHERE role.id_role IS NOT NULL AND role.slug NOT IN ('admin', 'platform_owner', 'tenant_admin')), '[]') as roles"))
      .leftJoin('profile_role', 'profile.id_profile', 'profile_role.id_profile')
      .leftJoin('role', 'profile_role.id_role', 'role.id_role');
    if (!includePlatformOwners) {
      query.whereNot(
        'profile.access_level',
        'platform_owner',
      );
    }
    return query
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

  private async replaceRoleGroupLinks(
    roleGroupId: string,
    roleIds: string[],
    profileIds: string[],
    trx: any,
    actor: AuthenticatedUser,
  ) {
    const cleanRoleIds = this.uniqueStrings(roleIds);
    const cleanProfileIds = this.uniqueStrings(profileIds);
    await this.assertManageableProfiles(
      cleanProfileIds,
      actor,
      trx,
    );
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
    const [{ count: billableCount }] =
      await this.knex('profile')
        .where('is_active', true)
        .whereNot(
          'access_level',
          'platform_owner',
        )
        .count('* as count');
    if (tenant && Number(billableCount) >= tenant.maxUsers) throw new BadRequestException(`Limita de ${tenant.maxUsers} profiluri active a fost atinsa.`);
  }

  private async assertNotLastTenantAdmin(profileId: string) {
    const isAdmin = await this.knex('profile')
      .where({
        id_profile: profileId,
        access_level: 'tenant_admin',
      })
      .first();
    if (!isAdmin) return;
    const [{ count }] = await this.knex('profile')
      .where({
        is_active: true,
        access_level: 'tenant_admin',
      })
      .whereNot('profile.id_profile', profileId)
      .countDistinct('profile.id_profile as count');
    if (Number(count) === 0) throw new BadRequestException('Ultimul profil administrator activ nu poate fi dezactivat.');
  }

  private async assertBusinessRoleIds(
    values: unknown,
  ) {
    if (!Array.isArray(values)) return;
    const roleIds = this.uniqueStrings(values);
    if (!roleIds.length) return;
    const roles = await this.knex('role')
      .whereIn('id_role', roleIds)
      .select('id_role', 'slug');
    if (
      roles.length !== roleIds.length ||
      roles.some((role) =>
        AdminSecurityService.RESERVED_ROLE_SLUGS.has(
          role.slug,
        ),
      )
    ) {
      throw new BadRequestException(
        'Pot fi atribuite numai roluri business.',
      );
    }
  }

  private async assertManageableProfiles(
    profileIds: string[],
    actor: AuthenticatedUser,
    db: any,
  ) {
    if (!profileIds.length) return;
    const forbiddenLevels = this.access.has(
      actor,
      'access_levels.manage',
    )
      ? ['platform_owner']
      : ['platform_owner', 'tenant_admin'];
    if (
      await db('profile')
        .whereIn('id_profile', profileIds)
        .whereIn(
          'access_level',
          forbiddenLevels,
        )
        .first()
    ) {
      throw new ForbiddenException(
        'Profilurile privilegiate nu pot fi modificate prin grupuri de roluri.',
      );
    }
  }

  private normalize(value?: string) { return value?.trim().toLowerCase(); }

  private uniqueStrings(values: string[]) {
    return [...new Set((values ?? []).filter((value): value is string => typeof value === 'string' && value.length > 0))];
  }
}
