import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamicSchemaService } from 'src/dynamic-schema/dynamic-schema.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { CreateFieldDto, UpdateFieldDto } from '../dto/field.dto';
import { validateGroupFieldLayout } from './field-layout.util';
import type { RankedItemDto } from '../dto/reorder.dto';
import { reorderRanks } from '../rank-reorder.util';

@Injectable()
export class AdminFieldsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly dynamicSchema: DynamicSchemaService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async findAllByEntity(entityId: string) {
    await this.ensureEntityExists(entityId);

    const fields = await this.knex('field')
      .leftJoin('ui_tab', 'field.id_ui_tab', 'ui_tab.id_ui_tab')
      .where('field.id_entity', entityId)
      .orderBy([
        { column: 'ui_tab.rank', order: 'asc' },
        { column: 'field.rank', order: 'asc' },
      ])
      .select('field.*');

    const result: any[] = [];
    for (const f of fields) {
      const relationEntity = f.id_relation_entity
        ? await this.knex('entity')
            .select('id_entity', 'slug', 'name')
            .where('id_entity', f.id_relation_entity)
            .first()
        : null;

      result.push({ ...f, relation_entity: relationEntity });
    }

    return result;
  }

  async findOne(entityId: string, fieldId: string) {
    await this.ensureEntityExists(entityId);

    const field = await this.knex('field')
      .where({ id_field: fieldId, id_entity: entityId })
      .first();

    if (!field) {
      throw new NotFoundException(
        `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
      );
    }

    const relationEntity = field.id_relation_entity
      ? await this.knex('entity')
          .select('id_entity', 'slug', 'name')
          .where('id_entity', field.id_relation_entity)
          .first()
      : null;

    return { ...field, relation_entity: relationEntity };
  }

  async create(entityId: string, dto: CreateFieldDto) {
    const entity = await this.ensureEntityExists(entityId);

    this.validateFileConfiguration(dto);
    if (dto.ui_type === 'file' && dto.is_required) {
      const [{ count }] = await this.knex(entity.table_name).count('* as count');
      if (Number(count) > 0) {
        throw new BadRequestException('Un camp de fisier nou nu poate fi obligatoriu cat timp entitatea are deja inregistrari.');
      }
    }

    const existingSlug = await this.knex('field')
      .where({ id_entity: entityId, slug: dto.slug })
      .first();

    if (existingSlug) {
      throw new ConflictException(
        `Slug-ul "${dto.slug}" este deja folosit in aceasta entitate.`,
      );
    }

    if (dto.ui_type === 'relation' && dto.id_relation_entity) {
      const targetEntity = await this.knex('entity')
        .where('id_entity', dto.id_relation_entity)
        .first();
      if (!targetEntity) {
        throw new NotFoundException(
          `Entitatea tinta pentru relatie cu id "${dto.id_relation_entity}" nu exista.`,
        );
      }
    }

    await this.validateLayoutForCreate(entityId, dto);

    const columnName = `cf_${dto.slug}`;

    // Resolve id_ui_tab: use provided value, or fallback to entity's "general" tab
    let idUiTab = dto.id_ui_tab ?? null;
    if (!idUiTab) {
      const generalTab = await this.knex('ui_tab')
        .where({ id_entity: entityId, slug: 'general' })
        .first();
      idUiTab = generalTab?.id_ui_tab ?? null;
    }

    // Auto-calculate rank within the selected tab
    let nextRank = 1;
    if (idUiTab) {
      const maxRankResult = await this.knex('field')
        .where({ id_entity: entityId, id_ui_tab: idUiTab })
        .max('rank as max_rank')
        .first();
      nextRank = ((maxRankResult?.max_rank as number) ?? 0) + 1;
    }

    const [field] = await this.knex('field')
      .insert({
        id_entity: entityId,
        name: dto.name,
        slug: dto.slug,
        column_name: columnName,
        data_type: dto.data_type,
        ui_type: dto.ui_type,
        default_value: dto.default_value ?? null,
        placeholder: dto.placeholder ?? null,
        help_text: dto.help_text ?? null,
        options: dto.options ? JSON.stringify(dto.options) : null,
        is_required: dto.is_required ?? false,
        is_unique: dto.ui_type === 'file' ? false : (dto.is_unique ?? false),
        is_filterable: dto.ui_type === 'file' ? false : (dto.is_filterable ?? false),
        is_sortable: dto.ui_type === 'file' ? false : (dto.is_sortable ?? true),
        visible_in_table: dto.visible_in_table ?? true,
        visible_in_form: dto.visible_in_form ?? true,
        is_readonly: dto.is_readonly ?? false,
        is_system: false,
        validation_rules: dto.validation_rules ? JSON.stringify(dto.validation_rules) : null,
        id_relation_entity: dto.ui_type === 'file' ? null : (dto.id_relation_entity ?? null),
        relation_display_field: dto.ui_type === 'file' ? null : (dto.relation_display_field ?? null),
        id_ui_tab: idUiTab,
        rank: dto.rank ?? nextRank,
        grid_col: dto.grid_col ?? 1,
        col_span: dto.col_span ?? 1,
      })
      .returning('*');

    try {
      await this.dynamicSchema.addColumn(entity, field);
    } catch (error) {
      await this.knex('field').where('id_field', field.id_field).del();
      throw error;
    }

    return field;
  }

  async update(entityId: string, fieldId: string, dto: UpdateFieldDto) {
    const entity = await this.ensureEntityExists(entityId);

    const field = await this.knex('field')
      .where({ id_field: fieldId, id_entity: entityId })
      .first();

    if (!field) {
      throw new NotFoundException(
        `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
      );
    }

    if (field.ui_type === 'file' && dto.ui_type && dto.ui_type !== 'file') {
      throw new BadRequestException('Tipul unui camp de fisier nu poate fi schimbat dupa creare.');
    }
    if (field.ui_type !== 'file' && dto.ui_type === 'file') {
      throw new BadRequestException('Un camp existent nu poate fi convertit in camp de fisier. Creeaza un camp nou.');
    }
    if (field.ui_type === 'file') this.validateFileConfiguration({ ...field, ...dto });

    await this.validateLayoutForUpdate(entityId, field, dto);

    // Daca tab-ul se schimba si rank-ul nu e setat explicit, recalculeaza automat
    const tabChanged = dto.id_ui_tab !== undefined && dto.id_ui_tab !== field.id_ui_tab;
    let effectiveRank = dto.rank;
    if (tabChanged && dto.rank === undefined && dto.id_ui_tab) {
      const newTabMax = await this.knex('field')
        .where({ id_entity: entityId, id_ui_tab: dto.id_ui_tab })
        .max('rank as max_rank')
        .first();
      effectiveRank = ((newTabMax?.max_rank as number) ?? 0) + 1;
    }

    const updateData: Record<string, any> = {
      name: dto.name ?? field.name,
      ui_type: dto.ui_type ?? field.ui_type,
      placeholder: dto.placeholder !== undefined ? dto.placeholder : field.placeholder,
      help_text: dto.help_text !== undefined ? dto.help_text : field.help_text,
      id_relation_entity: dto.id_relation_entity !== undefined ? dto.id_relation_entity : field.id_relation_entity,
      relation_display_field: dto.relation_display_field !== undefined ? dto.relation_display_field : field.relation_display_field,
      is_required: dto.is_required ?? field.is_required,
      is_unique: field.ui_type === 'file' ? false : (dto.is_unique ?? field.is_unique),
      is_filterable: field.ui_type === 'file' ? false : (dto.is_filterable ?? field.is_filterable),
      is_sortable: field.ui_type === 'file' ? false : (dto.is_sortable ?? field.is_sortable),
      visible_in_table: dto.visible_in_table ?? field.visible_in_table,
      visible_in_form: dto.visible_in_form ?? field.visible_in_form,
      is_readonly: dto.is_readonly ?? field.is_readonly,
      id_ui_tab: dto.id_ui_tab !== undefined ? dto.id_ui_tab : field.id_ui_tab,
      rank: effectiveRank ?? field.rank,
      grid_col: dto.grid_col ?? field.grid_col,
      col_span: dto.col_span ?? field.col_span,
      default_value: dto.default_value !== undefined ? dto.default_value : field.default_value,
      date_updated: new Date(),
    };

    if (dto.options !== undefined) {
      updateData.options = dto.options ? JSON.stringify(dto.options) : null;
    } else {
      updateData.options = field.options;
    }

    if (dto.validation_rules !== undefined) {
      updateData.validation_rules = dto.validation_rules ? JSON.stringify(dto.validation_rules) : null;
    } else {
      updateData.validation_rules = field.validation_rules;
    }

    if (dto.is_required !== undefined) {
      await this.dynamicSchema.updateColumnRequired(entity, field, dto.is_required);
    }

    const [updated] = await this.knex('field')
      .where('id_field', fieldId)
      .update(updateData)
      .returning('*');

    return updated;
  }

  async reorder(entityId: string, items: RankedItemDto[]) {
    await this.ensureEntityExists(entityId);
    const ids = items.map((item) => item.id);
    const fields = await this.knex('field')
      .select('id_field', 'id_ui_tab')
      .where('id_entity', entityId)
      .whereIn('id_field', ids);

    if (fields.length !== items.length) {
      throw new BadRequestException('Lista de reordonare contine campuri inexistente.');
    }

    const tabIds = new Set(fields.map((field) => field.id_ui_tab ?? null));
    if (tabIds.size !== 1) {
      throw new BadRequestException('Campurile pot fi reordonate doar in interiorul aceluiasi tab.');
    }

    await reorderRanks(this.knex, {
      table: 'field',
      idColumn: 'id_field',
      items,
      scope: {
        id_entity: entityId,
        id_ui_tab: fields[0].id_ui_tab ?? null,
      },
    });
    return this.findAllByEntity(entityId);
  }

  async remove(entityId: string, fieldId: string) {
    const entity = await this.ensureEntityExists(entityId);

    const field = await this.knex('field')
      .where({ id_field: fieldId, id_entity: entityId })
      .first();

    if (!field) {
      throw new NotFoundException(
        `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
      );
    }

    if (field.is_system) {
      throw new BadRequestException(
        `Campul "${field.name}" este un camp de sistem si nu poate fi sters.`,
      );
    }

    if (field.ui_type === 'file') {
      const file = await this.knex('stored_file').where({ id_field: fieldId }).first();
      if (file) {
        throw new BadRequestException('Campul nu poate fi sters cat timp exista fisiere incarcate pentru el.');
      }
    }

    const dashboardUsage = await this.knex('ui_widget as widget')
      .join('ui_block as block', 'block.id_ui_block', 'widget.id_ui_block')
      .join('ui_dashboard as dashboard', 'dashboard.id_ui_dashboard', 'block.id_ui_dashboard')
      .where((builder) => builder
        .where('widget.id_value_field', fieldId)
        .orWhere('widget.id_group_field', fieldId)
        .orWhere('widget.id_series_field', fieldId)
        .orWhere('widget.id_date_field', fieldId))
      .select('widget.title as widget_title', 'dashboard.name as dashboard_name')
      .first();
    if (dashboardUsage) {
      throw new BadRequestException(
        `Campul "${field.name}" este folosit de widget-ul "${dashboardUsage.widget_title}" din dashboard-ul "${dashboardUsage.dashboard_name}". Elimina mai intai widget-ul sau schimba sursa lui de date.`,
      );
    }

    await this.dynamicSchema.removeColumn(entity, field);

    await this.knex('field').where('id_field', fieldId).del();

    return { message: `Campul "${field.name}" a fost sters.` };
  }

  private async ensureEntityExists(entityId: string) {
    const entity = await this.knex('entity').where('id_entity', entityId).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${entityId}" nu exista.`);
    }
    return entity;
  }

  private async validateLayoutForCreate(entityId: string, dto: CreateFieldDto) {
    // Resolve the effective id_ui_tab for layout validation
    let idUiTab = dto.id_ui_tab ?? null;
    if (!idUiTab) {
      const generalTab = await this.knex('ui_tab')
        .where({ id_entity: entityId, slug: 'general' })
        .first();
      idUiTab = generalTab?.id_ui_tab ?? null;
    }

    const existingFields = await this.getGroupLayoutFields(entityId, idUiTab);

    validateGroupFieldLayout([
      ...existingFields,
      {
        id_field: `new:${dto.slug}`,
        name: dto.name,
        slug: dto.slug,
        id_ui_tab: idUiTab,
        rank: dto.rank ?? 1,
        grid_col: dto.grid_col ?? 1,
        col_span: dto.col_span ?? 1,
      },
    ]);
  }

  private async validateLayoutForUpdate(
    entityId: string,
    field: Record<string, any>,
    dto: UpdateFieldDto,
  ) {
    const idUiTab = dto.id_ui_tab !== undefined ? dto.id_ui_tab : field.id_ui_tab;
    const existingFields = await this.getGroupLayoutFields(entityId, idUiTab, field.id_field);

    validateGroupFieldLayout([
      ...existingFields,
      {
        id_field: field.id_field,
        name: dto.name ?? field.name,
        slug: field.slug,
        id_ui_tab: idUiTab,
        rank: dto.rank ?? field.rank,
        grid_col: dto.grid_col ?? field.grid_col,
        col_span: dto.col_span ?? field.col_span,
      },
    ]);
  }

  private async getGroupLayoutFields(entityId: string, idUiTab: string | null, excludeFieldId?: string) {
    let query = this.knex('field')
      .select('id_field', 'name', 'slug', 'id_ui_tab', 'rank', 'grid_col', 'col_span')
      .where({ id_entity: entityId, id_ui_tab: idUiTab });

    if (excludeFieldId) {
      query = query.whereNot('id_field', excludeFieldId);
    }

    return query;
  }

  private validateFileConfiguration(dto: Partial<CreateFieldDto> & { ui_type?: string; data_type?: string }) {
    if (dto.ui_type !== 'file') return;
    if (dto.data_type !== 'uuid') {
      throw new BadRequestException('Campurile de fisier trebuie sa foloseasca data_type "uuid".');
    }
    const rules = dto.validation_rules as Record<string, unknown> | undefined;
    if (!rules) return;
    if (rules.max_file_size_bytes !== undefined) {
      const size = Number(rules.max_file_size_bytes);
      if (!Number.isInteger(size) || size <= 0) {
        throw new BadRequestException('Limita campului de fisier trebuie exprimata in bytes si sa fie pozitiva.');
      }
    }
    if (rules.allowed_mime_types !== undefined) {
      if (!Array.isArray(rules.allowed_mime_types)
        || rules.allowed_mime_types.some((mime) => typeof mime !== 'string' || !mime.includes('/'))) {
        throw new BadRequestException('Lista MIME a campului de fisier este invalida.');
      }
    }
    if (rules.multiple === true) {
      throw new BadRequestException('MVP-ul curent permite un singur fisier per camp.');
    }
    if (rules.max_files !== undefined && Number(rules.max_files) !== 1) {
      throw new BadRequestException('MVP-ul curent permite max_files egal cu 1.');
    }
  }
}
