import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';

@Injectable()
export class SchemaService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  async getEntitySchema(entitySlug: string) {
    const entity = await this.knex('entity').where('slug', entitySlug).first();

    if (!entity) {
      throw new NotFoundException(`Entitatea "${entitySlug}" nu exista.`);
    }

    const fields = await this.knex('field')
      .leftJoin('ui_tab', 'field.id_ui_tab', 'ui_tab.id_ui_tab')
      .where('field.id_entity', entity.id_entity)
      .orderBy([
        { column: 'ui_tab.rank', order: 'asc' },
        { column: 'field.rank', order: 'asc' },
      ])
      .select('field.*');

    // Fetch tabs for this entity
    const tabs = await this.knex('ui_tab')
      .where('id_entity', entity.id_entity)
      .orderBy('rank', 'asc');

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
    };
  }
}
