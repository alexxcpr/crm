import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { RecordAccessService } from 'src/security/record-access.service';

@Injectable()
export class SchemaService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly recordAccess: RecordAccessService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async getEntitySchema(entitySlug: string, user: AuthenticatedUser) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();

    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }
    await this.recordAccess.require(user, entity, 'read');
    const capabilities =
      await this.recordAccess.capabilities(
        user,
        entity,
      );

    const fields = await this.knex('field')
      .leftJoin('ui_tab', 'field.id_ui_tab', 'ui_tab.id_ui_tab')
      .where('field.id_entity', entity.id_entity)
      .orderBy([
        { column: 'ui_tab.rank', order: 'asc' },
        { column: 'field.rank', order: 'asc' },
      ])
      .select('field.*');

    // Fetch tabs for this entity
    const rawTabs = await this.knex('ui_tab')
      .where('id_entity', entity.id_entity)
      .orderBy('rank', 'asc');
    const tabs: any[] = [];
    for (const tab of rawTabs) {
      tabs.push({
        ...tab,
        related_collection:
          tab.content_type ===
          'related_collection'
            ? await this.getRelatedCollection(
                tab.id_ui_tab,
                user,
              )
            : null,
      });
    }

    // Build a map: id_ui_tab → slug for quick lookup
    const tabMap = new Map<string, string>();
    for (const t of tabs) {
      tabMap.set(t.id_ui_tab, t.slug);
    }

    const enrichedFields: any[] = [];
    for (const f of fields) {
      let relationEntitySlug: string | null = null;
      if (f.id_relation_entity) {
        const relEnt = await this.knex('entity')
          .select('slug')
          .where('id_entity', f.id_relation_entity)
          .first();
        relationEntitySlug = relEnt?.slug ?? null;
      }

      enrichedFields.push({
        id_field: f.id_field,
        slug: f.slug,
        name: f.name,
        column_name: f.column_name,
        data_type: f.data_type,
        ui_type: f.ui_type,
        default_value: f.default_value,
        placeholder: f.placeholder,
        help_text: f.help_text,
        options: f.options,
        is_required: f.is_required,
        is_unique: f.is_unique,
        is_filterable: f.is_filterable,
        is_sortable: f.is_sortable,
        visible_in_table: f.visible_in_table,
        visible_in_form: f.visible_in_form,
        is_system: f.is_system,
        is_readonly: f.is_readonly,
        validation_rules: f.validation_rules,
        id_relation_entity: f.id_relation_entity,
        relation_kind: f.relation_kind,
        relation_display_field: f.relation_display_field,
        relation_entity_slug: relationEntitySlug,
        id_ui_tab: f.id_ui_tab,
        tab_slug: tabMap.get(f.id_ui_tab) ?? null,
        rank: f.rank,
        grid_col: f.grid_col,
        col_span: f.col_span,
      });
    }

    return {
      entity: {
        id_entity: entity.id_entity,
        slug: entity.slug,
        name: entity.name,
        table_name: entity.table_name,
        label_singular: entity.label_singular,
        label_plural: entity.label_plural,
        icon: entity.icon,
        is_system: entity.is_system,
        module: entity.id_module,
      },
      fields: enrichedFields,
      tabs,
      capabilities,
    };
  }

  private async getRelatedCollection(
    tabId: string,
    user: AuthenticatedUser,
  ) {
    const collection = await this.knex(
      'related_collection_definition as collection',
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
        'relation_field.id_field as relation_field_id',
        'relation_field.slug as relation_field_slug',
        'relation_field.column_name as relation_column_name',
        'relation_field.relation_kind',
        'child.id_entity as child_entity_id',
        'child.slug as child_entity_slug',
        'child.name as child_entity_name',
        'child.label_singular as child_label_singular',
        'child.label_plural as child_label_plural',
        'title_field.slug as card_title_field_slug',
        'title_field.column_name as card_title_column_name',
        'quick_file_field.slug as quick_add_file_field_slug',
      )
      .first();
    if (!collection) return null;

    const childEntity =
      await this.recordAccess.getEntity(
        collection.child_entity_id,
      );
    const capabilities =
      await this.recordAccess.capabilities(
        user,
        childEntity,
      );
    const cardFields = await this.knex(
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
      card_fields: cardFields,
      capabilities: {
        read: capabilities.read,
        create: collection.allow_create
          ? capabilities.create
          : null,
        update: collection.allow_update
          ? capabilities.update
          : null,
        delete: collection.allow_delete
          ? capabilities.delete
          : null,
      },
    };
  }
}
