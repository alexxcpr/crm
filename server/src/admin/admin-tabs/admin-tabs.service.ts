import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import {
  CreateTabDto,
  RelatedCollectionConfigDto,
  UpdateTabDto,
} from '../dto/tab.dto';
import type { RankedItemDto } from '../dto/reorder.dto';
import { reorderRanks } from '../rank-reorder.util';

@Injectable()
export class AdminTabsService {
  constructor(
    private readonly tenantContext: TenantContext,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  private async ensureEntityExists(
    entityId: string,
  ) {
    const entity = await this.knex('entity')
      .where('id_entity', entityId)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea cu id "${entityId}" nu exista.`,
      );
    }
    return entity;
  }

  async findAllByEntity(entityId: string) {
    // Verify entity exists
    const entity = await this.knex('entity')
      .where('id_entity', entityId)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea cu id "${entityId}" nu exista.`,
      );
    }

    const tabs = await this.knex('ui_tab')
      .where('id_entity', entityId)
      .orderBy('rank', 'asc');

    // Attach field count to each tab
    const result: any[] = [];
    for (const tab of tabs) {
      const [{ count }] = await this.knex('field')
        .where('id_ui_tab', tab.id_ui_tab)
        .count('* as count');

      result.push({
        ...tab,
        related_collection:
          tab.content_type ===
          'related_collection'
            ? await this.getRelatedCollection(
                tab.id_ui_tab,
              )
            : null,
        _count: { fields: Number(count) },
      });
    }

    return result;
  }

  async findOne(entityId: string, tabId: string) {
    const tab = await this.knex('ui_tab')
      .where({
        id_entity: entityId,
        id_ui_tab: tabId,
      })
      .first();

    if (!tab) {
      throw new NotFoundException(
        `Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`,
      );
    }

    const [{ count }] = await this.knex('field')
      .where('id_ui_tab', tabId)
      .count('* as count');

    return {
      ...tab,
      related_collection:
        tab.content_type === 'related_collection'
          ? await this.getRelatedCollection(
              tab.id_ui_tab,
            )
          : null,
      _count: { fields: Number(count) },
    };
  }

  async findIncomingRelationOptions(
    entityId: string,
  ) {
    await this.ensureEntityExists(entityId);
    const rows = await this.knex(
      'field as relation_field',
    )
      .join(
        'entity as child_entity',
        'child_entity.id_entity',
        'relation_field.id_entity',
      )
      .where({
        'relation_field.ui_type': 'relation',
        'relation_field.id_relation_entity':
          entityId,
      })
      .orderBy([
        {
          column: 'child_entity.name',
          order: 'asc',
        },
        {
          column: 'relation_field.name',
          order: 'asc',
        },
      ])
      .select(
        'relation_field.id_field',
        'relation_field.name as field_name',
        'relation_field.slug as field_slug',
        'relation_field.relation_kind',
        'child_entity.id_entity as child_entity_id',
        'child_entity.name as child_entity_name',
        'child_entity.slug as child_entity_slug',
      );

    const result: any[] = [];
    for (const row of rows) {
      const fields = await this.knex('field')
        .where('id_entity', row.child_entity_id)
        .orderBy('rank', 'asc')
        .select(
          'id_field',
          'name',
          'slug',
          'column_name',
          'data_type',
          'ui_type',
          'is_required',
          'is_readonly',
          'default_value',
        );
      result.push({ ...row, fields });
    }
    return result;
  }

  async create(
    entityId: string,
    dto: CreateTabDto,
  ) {
    // Verify entity exists
    const entity = await this.knex('entity')
      .where('id_entity', entityId)
      .first();
    if (!entity) {
      throw new NotFoundException(
        `Entitatea cu id "${entityId}" nu exista.`,
      );
    }

    // Check slug uniqueness per entity
    const existing = await this.knex('ui_tab')
      .where({
        id_entity: entityId,
        slug: dto.slug,
      })
      .first();
    if (existing) {
      throw new ConflictException(
        `Un tab cu slug-ul "${dto.slug}" exista deja in aceasta entitate.`,
      );
    }

    // Auto-assign rank if not specified or explicitly set to 0
    let rank = dto.rank;
    if (rank === undefined || rank === 0) {
      const maxRankResult = await this.knex(
        'ui_tab',
      )
        .where('id_entity', entityId)
        .max('rank as max_rank')
        .first();
      rank =
        ((maxRankResult?.max_rank as number) ??
          0) + 1;
    }

    return this.knex.transaction(async (trx) => {
      const [tab] = await trx('ui_tab')
        .insert({
          id_entity: entityId,
          name: dto.name,
          slug: dto.slug,
          rank,
          is_system: dto.is_system ?? false,
          content_type:
            dto.content_type ?? 'fields',
        })
        .returning('*');

      if (
        tab.content_type === 'related_collection'
      ) {
        if (!dto.related_collection) {
          throw new BadRequestException(
            'Configuratia colectiei asociate este obligatorie.',
          );
        }
        await this.saveRelatedCollection(
          trx,
          tab,
          dto.related_collection,
        );
      }
      return {
        ...tab,
        related_collection:
          tab.content_type ===
          'related_collection'
            ? await this.getRelatedCollection(
                tab.id_ui_tab,
                trx,
              )
            : null,
      };
    });
  }

  async update(
    entityId: string,
    tabId: string,
    dto: UpdateTabDto,
  ) {
    const tab = await this.knex('ui_tab')
      .where({
        id_entity: entityId,
        id_ui_tab: tabId,
      })
      .first();

    if (!tab) {
      throw new NotFoundException(
        `Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`,
      );
    }

    // Check slug uniqueness (excluding self)
    if (dto.slug) {
      const slugConflict = await this.knex(
        'ui_tab',
      )
        .where({
          id_entity: entityId,
          slug: dto.slug,
        })
        .whereNot('id_ui_tab', tabId)
        .first();

      if (slugConflict) {
        throw new ConflictException(
          `Un tab cu slug-ul "${dto.slug}" exista deja in aceasta entitate.`,
        );
      }
    }

    const updateData: Record<string, any> = {
      date_updated: new Date(),
    };

    if (dto.name !== undefined)
      updateData.name = dto.name;
    if (dto.slug !== undefined)
      updateData.slug = dto.slug;
    if (dto.rank !== undefined)
      updateData.rank = dto.rank;

    return this.knex.transaction(async (trx) => {
      const [updated] = await trx('ui_tab')
        .where('id_ui_tab', tabId)
        .update(updateData)
        .returning('*');
      if (dto.related_collection) {
        if (
          tab.content_type !==
          'related_collection'
        ) {
          throw new BadRequestException(
            'Un tab de campuri nu poate avea configuratie de colectie.',
          );
        }
        await this.saveRelatedCollection(
          trx,
          updated,
          dto.related_collection,
          true,
        );
      }
      return {
        ...updated,
        related_collection:
          updated.content_type ===
          'related_collection'
            ? await this.getRelatedCollection(
                updated.id_ui_tab,
                trx,
              )
            : null,
      };
    });
  }

  async reorder(
    entityId: string,
    items: RankedItemDto[],
  ) {
    await this.ensureEntityExists(entityId);
    await reorderRanks(this.knex, {
      table: 'ui_tab',
      idColumn: 'id_ui_tab',
      items,
      scope: { id_entity: entityId },
    });
    return this.findAllByEntity(entityId);
  }

  async remove(entityId: string, tabId: string) {
    const tab = await this.knex('ui_tab')
      .where({
        id_entity: entityId,
        id_ui_tab: tabId,
      })
      .first();

    if (!tab) {
      throw new NotFoundException(
        `Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`,
      );
    }

    // System tabs cannot be deleted
    if (tab.is_system) {
      throw new BadRequestException(
        `Tab-ul "${tab.name}" este un tab de sistem si nu poate fi sters.`,
      );
    }

    // Check if tab has fields
    const [{ count }] = await this.knex('field')
      .where('id_ui_tab', tabId)
      .count('* as count');

    if (Number(count) > 0) {
      throw new BadRequestException(
        `Tab-ul "${tab.name}" are ${count} campuri asociate. Mutați campurile in alt tab inainte de a-l sterge.`,
      );
    }

    await this.knex('ui_tab')
      .where('id_ui_tab', tabId)
      .del();

    return {
      message: `Tab-ul "${tab.name}" a fost sters.`,
    };
  }

  private async getRelatedCollection(
    tabId: string,
    db: any = this.knex,
  ) {
    const collection = await db(
      'related_collection_definition as collection',
    )
      .join(
        'field as relation_field',
        'relation_field.id_field',
        'collection.id_relation_field',
      )
      .join(
        'entity as child_entity',
        'child_entity.id_entity',
        'relation_field.id_entity',
      )
      .leftJoin(
        'field as title_field',
        'title_field.id_field',
        'collection.card_title_field_id',
      )
      .leftJoin(
        'field as quick_file_field',
        'quick_file_field.id_field',
        'collection.id_quick_add_file_field',
      )
      .where('collection.id_ui_tab', tabId)
      .select(
        'collection.*',
        'relation_field.name as relation_field_name',
        'relation_field.slug as relation_field_slug',
        'relation_field.relation_kind',
        'child_entity.id_entity as child_entity_id',
        'child_entity.name as child_entity_name',
        'child_entity.slug as child_entity_slug',
        'title_field.name as card_title_field_name',
        'quick_file_field.name as quick_add_file_field_name',
      )
      .first();
    if (!collection) return null;
    const cardFields = await db(
      'related_collection_card_field as card_field',
    )
      .join(
        'field',
        'field.id_field',
        'card_field.id_field',
      )
      .where(
        'card_field.id_related_collection',
        collection.id_related_collection,
      )
      .orderBy('card_field.rank', 'asc')
      .select(
        'field.id_field',
        'field.name',
        'field.slug',
        'field.column_name',
        'field.ui_type',
        'card_field.rank',
      );
    return {
      ...collection,
      card_field_ids: cardFields.map(
        (field: any) => field.id_field,
      ),
      card_fields: cardFields,
    };
  }

  private async saveRelatedCollection(
    trx: any,
    tab: any,
    dto: RelatedCollectionConfigDto,
    updating = false,
  ) {
    const relation = await trx('field')
      .where({
        id_field: dto.id_relation_field,
        ui_type: 'relation',
        id_relation_entity: tab.id_entity,
      })
      .first();
    if (!relation) {
      throw new BadRequestException(
        'Relatia selectata nu pointeaza catre entitatea acestui tab.',
      );
    }

    const existing = await trx(
      'related_collection_definition',
    )
      .where('id_ui_tab', tab.id_ui_tab)
      .first();
    if (
      updating &&
      existing &&
      existing.id_relation_field !==
        dto.id_relation_field
    ) {
      throw new BadRequestException(
        'Relatia sursa a unui tab asociat nu poate fi schimbata.',
      );
    }
    if (!dto.allow_table && !dto.allow_cards) {
      throw new BadRequestException(
        'Colectia trebuie sa permita cel putin o vizualizare.',
      );
    }
    if (
      (dto.default_view === 'table' &&
        !dto.allow_table) ||
      (dto.default_view === 'cards' &&
        !dto.allow_cards)
    ) {
      throw new BadRequestException(
        'Vizualizarea implicita trebuie sa fie permisa.',
      );
    }

    const childFields = await trx('field').where(
      'id_entity',
      relation.id_entity,
    );
    const byId = new Map(
      childFields.map((field: any) => [
        field.id_field,
        field,
      ]),
    );
    if (
      dto.allow_cards &&
      (!dto.card_title_field_id ||
        !byId.has(dto.card_title_field_id))
    ) {
      throw new BadRequestException(
        'Campul titlu al cardului trebuie sa apartina entitatii copil.',
      );
    }
    for (const fieldId of dto.card_field_ids ??
      []) {
      if (!byId.has(fieldId)) {
        throw new BadRequestException(
          'Toate campurile cardului trebuie sa apartina entitatii copil.',
        );
      }
    }

    let quickFileField: any = null;
    if (dto.quick_add_mode === 'multi_file') {
      quickFileField = dto.id_quick_add_file_field
        ? byId.get(dto.id_quick_add_file_field)
        : null;
      if (
        !quickFileField ||
        quickFileField.ui_type !== 'file'
      ) {
        throw new BadRequestException(
          'Quick add multi-file necesita un camp de fisier al entitatii copil.',
        );
      }
      const missingDefaults = childFields.filter(
        (field: any) =>
          field.id_field !== relation.id_field &&
          field.id_field !==
            quickFileField.id_field &&
          field.is_required &&
          !field.is_readonly &&
          field.default_value == null &&
          field.data_type !== 'boolean',
      );
      if (missingDefaults.length) {
        throw new BadRequestException(
          `Quick add multi-file necesita valori implicite pentru: ${missingDefaults.map((field: any) => field.name).join(', ')}.`,
        );
      }
    }

    const payload = {
      id_relation_field: relation.id_field,
      default_view: dto.default_view,
      allow_table: dto.allow_table,
      allow_cards: dto.allow_cards,
      card_title_field_id: dto.allow_cards
        ? dto.card_title_field_id
        : null,
      page_size: dto.page_size,
      default_sort: dto.default_sort,
      allow_create: dto.allow_create,
      allow_update: dto.allow_update,
      allow_delete: dto.allow_delete,
      quick_add_mode: dto.quick_add_mode,
      id_quick_add_file_field:
        dto.quick_add_mode === 'multi_file'
          ? dto.id_quick_add_file_field
          : null,
      date_updated: new Date(),
    };

    let collection: any;
    if (existing) {
      [collection] = await trx(
        'related_collection_definition',
      )
        .where(
          'id_related_collection',
          existing.id_related_collection,
        )
        .update(payload)
        .returning('*');
      await trx('related_collection_card_field')
        .where(
          'id_related_collection',
          existing.id_related_collection,
        )
        .del();
    } else {
      [collection] = await trx(
        'related_collection_definition',
      )
        .insert({
          ...payload,
          id_ui_tab: tab.id_ui_tab,
          date_created: new Date(),
        })
        .returning('*');
    }

    const cardFieldIds = dto.allow_cards
      ? (dto.card_field_ids ?? [])
      : [];
    if (cardFieldIds.length) {
      await trx(
        'related_collection_card_field',
      ).insert(
        cardFieldIds.map((idField, index) => ({
          id_related_collection:
            collection.id_related_collection,
          id_field: idField,
          rank: index + 1,
        })),
      );
    }
  }

  async removeMany(
    entityId: string,
    ids: string[],
  ) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException(
        'Lista de id-uri este goala.',
      );
    }

    const tabs = await this.knex('ui_tab')
      .where('id_entity', entityId)
      .whereIn('id_ui_tab', ids);

    if (tabs.length === 0) {
      throw new NotFoundException(
        'Niciun tab gasit cu id-urile specificate.',
      );
    }

    const errors: string[] = [];

    for (const tab of tabs) {
      if (tab.is_system) {
        errors.push(
          `Tab-ul "${tab.name}" este un tab de sistem si nu poate fi sters.`,
        );
        continue;
      }

      const [{ count }] = await this.knex('field')
        .where('id_ui_tab', tab.id_ui_tab)
        .count('* as count');

      if (Number(count) > 0) {
        errors.push(
          `Tab-ul "${tab.name}" are ${count} campuri asociate. Mutați campurile in alt tab inainte de a-l sterge.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(
        errors.join(' '),
      );
    }

    const nonSystemIds = tabs
      .filter((t) => !t.is_system)
      .map((t) => t.id_ui_tab);
    const deletedCount = await this.knex('ui_tab')
      .whereIn('id_ui_tab', nonSystemIds)
      .del();

    return {
      message: `${deletedCount} tab-uri au fost sterse.`,
    };
  }
}
