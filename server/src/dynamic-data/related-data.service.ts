/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return */
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { Entity } from 'src/types/entities';
import type { AuthenticatedUser } from 'src/security/security.types';
import { RecordAccessService } from 'src/security/record-access.service';
import { DynamicDataService } from './dynamic-data.service';

interface RelatedCollection {
  id_related_collection: string;
  collection_slug: string;
  relation_kind: 'reference' | 'composition';
  relation_field_id: string;
  relation_field_slug: string;
  relation_column_name: string;
  parent_entity: Entity;
  child_entity: Entity;
  allow_create: boolean;
  allow_update: boolean;
  allow_delete: boolean;
}

@Injectable()
export class RelatedDataService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly data: DynamicDataService,
    private readonly recordAccess: RecordAccessService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  private async resolve(
    parentSlug: string,
    collectionSlug: string,
  ): Promise<RelatedCollection> {
    const row = await this.knex(
      'related_collection_definition as collection',
    )
      .join(
        'ui_tab as tab',
        'tab.id_ui_tab',
        'collection.id_ui_tab',
      )
      .join(
        'entity as parent',
        'parent.id_entity',
        'tab.id_entity',
      )
      .join(
        'field as relation_field',
        'relation_field.id_field',
        'collection.id_relation_field',
      )
      .join(
        'entity as child',
        'child.id_entity',
        'relation_field.id_entity',
      )
      .where({
        'parent.slug': parentSlug,
        'tab.slug': collectionSlug,
        'tab.content_type': 'related_collection',
      })
      .select(
        'collection.*',
        'tab.slug as collection_slug',
        'relation_field.id_field as relation_field_id',
        'relation_field.slug as relation_field_slug',
        'relation_field.column_name as relation_column_name',
        'relation_field.relation_kind',
        ...this.entityColumns('parent', 'parent'),
        ...this.entityColumns('child', 'child'),
      )
      .first();
    if (!row) {
      throw new NotFoundException(
        'Colectia asociata nu exista.',
      );
    }
    return {
      ...row,
      parent_entity: this.readEntity(
        row,
        'parent',
      ),
      child_entity: this.readEntity(row, 'child'),
    };
  }

  private entityColumns(
    alias: string,
    prefix: string,
  ) {
    return [
      `${alias}.id_entity as ${prefix}_id_entity`,
      `${alias}.id_module as ${prefix}_id_module`,
      `${alias}.name as ${prefix}_name`,
      `${alias}.slug as ${prefix}_slug`,
      `${alias}.table_name as ${prefix}_table_name`,
      `${alias}.icon as ${prefix}_icon`,
      `${alias}.is_system as ${prefix}_is_system`,
      `${alias}.label_singular as ${prefix}_label_singular`,
      `${alias}.label_plural as ${prefix}_label_plural`,
      `${alias}.rank as ${prefix}_rank`,
      `${alias}.date_created as ${prefix}_date_created`,
      `${alias}.date_updated as ${prefix}_date_updated`,
    ];
  }

  private readEntity(
    row: Record<string, any>,
    prefix: string,
  ): Entity {
    return {
      id_entity: row[`${prefix}_id_entity`],
      id_module: row[`${prefix}_id_module`],
      name: row[`${prefix}_name`],
      slug: row[`${prefix}_slug`],
      table_name: row[`${prefix}_table_name`],
      icon: row[`${prefix}_icon`],
      is_system: row[`${prefix}_is_system`],
      label_singular:
        row[`${prefix}_label_singular`],
      label_plural: row[`${prefix}_label_plural`],
      rank: row[`${prefix}_rank`],
      date_created: row[`${prefix}_date_created`],
      date_updated: row[`${prefix}_date_updated`],
    };
  }

  private async assertParentReadable(
    collection: RelatedCollection,
    parentId: string,
    actor: AuthenticatedUser,
  ) {
    await this.recordAccess.assertRecord(
      actor,
      collection.parent_entity,
      parentId,
      'read',
    );
  }

  private assertAllowed(
    collection: RelatedCollection,
    action: 'create' | 'update' | 'delete',
  ) {
    const allowed =
      action === 'create'
        ? collection.allow_create
        : action === 'update'
          ? collection.allow_update
          : collection.allow_delete;
    if (!allowed) {
      throw new ForbiddenException(
        'Operatia este dezactivata pentru aceasta colectie.',
      );
    }
  }

  async findAll(
    parentSlug: string,
    parentId: string,
    collectionSlug: string,
    query: Record<string, any>,
    actor: AuthenticatedUser,
  ) {
    const collection = await this.resolve(
      parentSlug,
      collectionSlug,
    );
    await this.assertParentReadable(
      collection,
      parentId,
      actor,
    );
    const result = await this.data.findAll(
      collection.child_entity.slug,
      query,
      actor,
      {
        // Colectiile pot alterna intre tabel si carduri. Cardurile pot folosi
        // campuri care nu sunt visible_in_table, deci endpointul nested trebuie
        // sa furnizeze ambele proiectii din acelasi raspuns paginat.
        tableOnly: false,
        fixedWhere: {
          [collection.relation_column_name]:
            parentId,
        },
      },
    );
    const capabilities =
      await this.recordAccess.capabilities(
        actor,
        collection.child_entity,
      );
    let compositionParentWritable = true;
    if (
      collection.relation_kind === 'composition'
    ) {
      try {
        await this.recordAccess.assertRecord(
          actor,
          collection.parent_entity,
          parentId,
          'update',
        );
      } catch {
        compositionParentWritable = false;
      }
    }
    return {
      ...result,
      capabilities: {
        read: Boolean(capabilities.read),
        create:
          collection.allow_create &&
          compositionParentWritable &&
          Boolean(capabilities.create),
        update:
          collection.allow_update &&
          compositionParentWritable &&
          Boolean(capabilities.update),
        delete:
          collection.allow_delete &&
          compositionParentWritable &&
          Boolean(capabilities.delete),
      },
    };
  }

  async create(
    parentSlug: string,
    parentId: string,
    collectionSlug: string,
    body: Record<string, any>,
    actor: AuthenticatedUser,
  ) {
    const collection = await this.resolve(
      parentSlug,
      collectionSlug,
    );
    this.assertAllowed(collection, 'create');
    await this.assertParentReadable(
      collection,
      parentId,
      actor,
    );
    this.assertNoConflictingParent(
      body,
      collection,
      parentId,
    );
    return this.data.create(
      collection.child_entity.slug,
      {
        ...body,
        [collection.relation_field_slug]:
          parentId,
      },
      actor,
    );
  }

  async update(
    parentSlug: string,
    parentId: string,
    collectionSlug: string,
    childId: string,
    body: Record<string, any>,
    actor: AuthenticatedUser,
  ) {
    const collection = await this.resolve(
      parentSlug,
      collectionSlug,
    );
    this.assertAllowed(collection, 'update');
    await this.assertParentReadable(
      collection,
      parentId,
      actor,
    );
    await this.recordAccess.assertRecord(
      actor,
      collection.child_entity,
      childId,
      'update',
    );
    await this.assertMembership(
      collection,
      parentId,
      childId,
    );
    this.assertNoConflictingParent(
      body,
      collection,
      parentId,
    );
    const nextBody = { ...body };
    delete nextBody[
      collection.relation_field_slug
    ];
    delete nextBody[
      collection.relation_column_name
    ];
    return this.data.update(
      collection.child_entity.slug,
      childId,
      nextBody,
      actor,
    );
  }

  async remove(
    parentSlug: string,
    parentId: string,
    collectionSlug: string,
    childId: string,
    actor: AuthenticatedUser,
  ) {
    const collection = await this.resolve(
      parentSlug,
      collectionSlug,
    );
    this.assertAllowed(collection, 'delete');
    await this.assertParentReadable(
      collection,
      parentId,
      actor,
    );
    await this.recordAccess.assertRecord(
      actor,
      collection.child_entity,
      childId,
      'delete',
    );
    await this.assertMembership(
      collection,
      parentId,
      childId,
    );
    return this.data.remove(
      collection.child_entity.slug,
      childId,
      actor,
    );
  }

  private assertNoConflictingParent(
    body: Record<string, any>,
    collection: RelatedCollection,
    parentId: string,
  ) {
    for (const key of [
      collection.relation_field_slug,
      collection.relation_column_name,
    ]) {
      if (
        Object.prototype.hasOwnProperty.call(
          body,
          key,
        ) &&
        body[key] !== parentId
      ) {
        throw new BadRequestException(
          'Parintele trimis in payload nu corespunde URL-ului.',
        );
      }
    }
  }

  private async assertMembership(
    collection: RelatedCollection,
    parentId: string,
    childId: string,
  ) {
    const child = await this.knex(
      collection.child_entity.table_name,
    )
      .where({
        id: childId,
        [collection.relation_column_name]:
          parentId,
      })
      .first();
    if (!child) {
      throw new NotFoundException(
        'Copilul nu apartine acestei colectii.',
      );
    }
  }
}
