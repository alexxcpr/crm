import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Knex } from 'knex';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthenticatedUser, PermissionAction, PermissionScope } from './security.types';

@Injectable()
export class AuthorizationService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  async getEntity(entitySlug: string) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();
    if (!entity) throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    return entity;
  }

  async getScope(user: AuthenticatedUser, entityId: string, action: PermissionAction): Promise<PermissionScope | null> {
    if (user.must_change_password) return null;
    if (user.roles.includes('admin')) return 'all';
    const actions = action === 'change_ownership' ? [action] : [action, 'manage'];
    const rows = await this.knex('profile_role')
      .join('role_permission', 'profile_role.id_role', 'role_permission.id_role')
      .where('profile_role.id_profile', user.profileId)
      .where('role_permission.id_entity', entityId)
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
}
