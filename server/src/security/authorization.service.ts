import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthenticatedUser, PermissionAction, PermissionScope } from './security.types';
import { AccessControlService } from './access-control.service';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly access: AccessControlService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async getEntity(entitySlug: string) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    return entity;
  }

  async getScope(user: AuthenticatedUser, entityId: string, action: PermissionAction): Promise<PermissionScope | null> {
    if (user.must_change_password) return null;
    if (this.access.has(user, 'data.manage_all'))
      return 'all';
    const actions = action === 'change_ownership' ? [action] : [action, 'manage'];
    const rows = await this.knex('profile_role')
      .join('role_permission', 'profile_role.id_role', 'role_permission.id_role')
      .join(
        'role',
        'profile_role.id_role',
        'role.id_role',
      )
      .where('profile_role.id_profile', user.profileId)
      .where('role_permission.id_entity', entityId)
      .whereNotIn('role.slug', [
        'admin',
        'platform_owner',
        'tenant_admin',
      ])
      .whereIn('role_permission.action', actions)
      .select('role_permission.scope', 'role_permission.action');
    if (!rows.length) return null;
    if (action === 'create' || action === 'change_ownership') return 'all';
    return rows.some((row) => row.scope === 'all') ? 'all' : 'owner';
  }

  async require(user: AuthenticatedUser, entityId: string, action: PermissionAction): Promise<PermissionScope> {
    const scope = await this.getScope(user, entityId, action);
    if (!scope) throw new ForbiddenException('Nu ai permisiunea necesara pentru aceasta entitate.');
    return scope;
  }

  applyScope<T extends Knex.QueryBuilder>(query: T, tableName: string, scope: PermissionScope, profileId: string): T {
    if (scope === 'owner') query.where(`${tableName}.id_profile`, profileId);
    return query;
  }

  async capabilities(user: AuthenticatedUser, entityId: string) {
    const actions: PermissionAction[] = ['read', 'create', 'update', 'delete', 'manage', 'change_ownership'];
    const entries = await Promise.all(actions.map(async (action) => [action, await this.getScope(user, entityId, action)]));
    return Object.fromEntries(entries) as Record<PermissionAction, PermissionScope | null>;
  }

  async capabilitiesForAllEntities(user: AuthenticatedUser) {
    const actions: PermissionAction[] = ['read', 'create', 'update', 'delete', 'manage', 'change_ownership'];
    const result: Record<string, Record<PermissionAction, PermissionScope | null>> = {};
    const manageAll = !user.must_change_password && this.access.has(user, 'data.manage_all');
    let rows: Array<{ entity_slug: string, action: PermissionAction | null, scope: PermissionScope | null }>;

    if (user.must_change_password || manageAll) {
      rows = await this.knex('entity').select('slug as entity_slug').then((entities) =>
        entities.map((entity) => ({ entity_slug: entity.entity_slug, action: null, scope: null })),
      );
    } else {
      const profilePermissions = this.knex('profile_role as pr')
        .join('role_permission as rp', 'rp.id_role', 'pr.id_role')
        .join('role as r', 'r.id_role', 'pr.id_role')
        .where('pr.id_profile', user.profileId)
        .whereNotIn('r.slug', ['admin', 'platform_owner', 'tenant_admin'])
        .select('rp.id_entity', 'rp.action', 'rp.scope');
      rows = await this.knex('entity as e')
        .leftJoin(profilePermissions.as('permission'), 'permission.id_entity', 'e.id_entity')
        .select(
          'e.slug as entity_slug',
          'permission.action',
          'permission.scope',
        );
    }

    for (const row of rows) {
      result[row.entity_slug] ??= Object.fromEntries(
        actions.map((action) => [action, manageAll ? 'all' : null]),
      ) as Record<PermissionAction, PermissionScope | null>;
    }

    if (user.must_change_password || manageAll) return result;

    const permissionRows = rows.filter(
      (row): row is typeof row & { action: PermissionAction } => row.action !== null,
    );

    for (const entitySlug of Object.keys(result)) {
      const entityRows = permissionRows.filter((row) => row.entity_slug === entitySlug);
      for (const action of actions) {
        const acceptedActions = action === 'change_ownership' ? [action] : [action, 'manage'];
        const matches = entityRows.filter((row) => acceptedActions.includes(row.action));
        if (!matches.length) continue;
        result[entitySlug][action] = action === 'create' || action === 'change_ownership'
          ? 'all'
          : matches.some((row) => row.scope === 'all') ? 'all' : 'owner';
      }
    }

    return result;
  }
}
