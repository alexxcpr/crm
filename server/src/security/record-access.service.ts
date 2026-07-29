/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Knex } from 'knex';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { Entity } from 'src/types/entities';
import { AuthorizationService } from './authorization.service';
import type {
  AuthenticatedUser,
  PermissionAction,
  PermissionScope,
} from './security.types';

export interface CompositionStep {
  childEntity: Entity;
  relationField: Record<string, any>;
  parentEntity: Entity;
}

export interface RecordAccessPolicy {
  requestedAction: PermissionAction;
  effectiveAction: PermissionAction;
  scope: PermissionScope;
  entity: Entity;
  rootEntity: Entity;
  composition: CompositionStep[];
}

@Injectable()
export class RecordAccessService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authorization: AuthorizationService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async getEntity(
    entitySlugOrId: string,
  ): Promise<Entity> {
    const entity = await this.knex('entity')
      .where((builder) =>
        builder
          .where('slug', entitySlugOrId)
          .orWhere('id_entity', entitySlugOrId),
      )
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea "${entitySlugOrId}" nu exista.`,
      );
    }
    return entity;
  }

  async compositionChain(
    entity: Entity,
  ): Promise<{
    rootEntity: Entity;
    steps: CompositionStep[];
  }> {
    const steps: CompositionStep[] = [];
    const visited = new Set<string>();
    let current = entity;

    while (true) {
      if (visited.has(current.id_entity)) {
        throw new ForbiddenException(
          'Graful composition contine un ciclu.',
        );
      }
      visited.add(current.id_entity);
      const relationField = await this.knex(
        'field',
      )
        .where({
          id_entity: current.id_entity,
          ui_type: 'relation',
          relation_kind: 'composition',
        })
        .first();
      if (!relationField) {
        return { rootEntity: current, steps };
      }
      const parentEntity = await this.knex(
        'entity',
      )
        .where(
          'id_entity',
          relationField.id_relation_entity,
        )
        .first();
      if (!parentEntity) {
        throw new NotFoundException(
          'Parintele composition nu mai exista.',
        );
      }
      steps.push({
        childEntity: current,
        relationField,
        parentEntity,
      });
      current = parentEntity;
    }
  }

  async getPolicy(
    actor: AuthenticatedUser,
    entity: Entity,
    action: PermissionAction,
    aggregateDelete = false,
  ): Promise<RecordAccessPolicy | null> {
    const { rootEntity, steps } =
      await this.compositionChain(entity);
    let effectiveAction = action;
    if (steps.length) {
      if (action === 'read') {
        effectiveAction = 'read';
      } else if (
        aggregateDelete &&
        action === 'delete'
      ) {
        effectiveAction = 'delete';
      } else if (
        ['create', 'update', 'delete'].includes(
          action,
        )
      ) {
        effectiveAction = 'update';
      } else if (action === 'change_ownership') {
        return null;
      }
    }
    const scope =
      await this.authorization.getScope(
        actor,
        rootEntity.id_entity,
        effectiveAction,
      );
    if (!scope) return null;
    return {
      requestedAction: action,
      effectiveAction,
      scope,
      entity,
      rootEntity,
      composition: steps,
    };
  }

  async require(
    actor: AuthenticatedUser,
    entity: Entity,
    action: PermissionAction,
    aggregateDelete = false,
  ): Promise<RecordAccessPolicy> {
    const policy = await this.getPolicy(
      actor,
      entity,
      action,
      aggregateDelete,
    );
    if (!policy) {
      throw new ForbiddenException(
        'Nu ai permisiunea necesara pentru aceasta entitate.',
      );
    }
    return policy;
  }

  applyScope<T extends Knex.QueryBuilder>(
    query: T,
    baseAlias: string,
    policy: RecordAccessPolicy,
    profileId: string,
  ): T {
    let currentAlias = baseAlias;
    policy.composition.forEach((step, index) => {
      const parentAlias = `access_parent_${index}`;
      query.leftJoin(
        `${step.parentEntity.table_name} as ${parentAlias}`,
        `${currentAlias}.${step.relationField.column_name}`,
        `${parentAlias}.id`,
      );
      currentAlias = parentAlias;
    });
    if (policy.scope === 'owner') {
      query.where(
        `${currentAlias}.id_profile`,
        profileId,
      );
    }
    return query;
  }

  async assertRecord(
    actor: AuthenticatedUser,
    entity: Entity,
    recordId: string,
    action: PermissionAction,
    aggregateDelete = false,
  ): Promise<{
    record: Record<string, any>;
    policy: RecordAccessPolicy;
  }> {
    const policy = await this.require(
      actor,
      entity,
      action,
      aggregateDelete,
    );
    const query = this.knex(
      `${entity.table_name} as access_record`,
    )
      .select('access_record.*')
      .where('access_record.id', recordId);
    this.applyScope(
      query,
      'access_record',
      policy,
      actor.profileId,
    );
    const record = await query.first();
    if (!record) {
      throw new NotFoundException(
        'Inregistrarea nu exista sau nu este accesibila.',
      );
    }
    return { record, policy };
  }

  async capabilities(
    actor: AuthenticatedUser,
    entity: Entity,
  ) {
    const actions: PermissionAction[] = [
      'read',
      'create',
      'update',
      'delete',
      'manage',
      'change_ownership',
    ];
    const entries = await Promise.all(
      actions.map(async (action) => [
        action,
        (
          await this.getPolicy(
            actor,
            entity,
            action,
          )
        )?.scope ?? null,
      ]),
    );
    return Object.fromEntries(entries) as Record<
      PermissionAction,
      PermissionScope | null
    >;
  }
}
