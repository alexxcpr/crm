import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamicSchemaService } from 'src/dynamic-schema/dynamic-schema.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { CreateFieldDto, UpdateFieldDto } from '../dto/field.dto';
import { validateGroupFieldLayout } from './field-layout.util';

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
        is_unique: dto.is_unique ?? false,
        is_filterable: dto.is_filterable ?? false,
        is_sortable: dto.is_sortable ?? true,
        visible_in_table: dto.visible_in_table ?? true,
        visible_in_form: dto.visible_in_form ?? true,
        is_readonly: dto.is_readonly ?? false,
        is_system: false,
        validation_rules: dto.validation_rules ? JSON.stringify(dto.validation_rules) : null,
        id_relation_entity: dto.id_relation_entity ?? null,
        relation_display_field: dto.relation_display_field ?? null,
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
    await this.ensureEntityExists(entityId);

    const field = await this.knex('field')
      .where({ id_field: fieldId, id_entity: entityId })
      .first();

    if (!field) {
      throw new NotFoundException(
        `Campul cu id "${fieldId}" nu exista in entitatea "${entityId}".`,
      );
    }

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
      is_unique: dto.is_unique ?? field.is_unique,
      is_filterable: dto.is_filterable ?? field.is_filterable,
      is_sortable: dto.is_sortable ?? field.is_sortable,
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

    const [updated] = await this.knex('field')
      .where('id_field', fieldId)
      .update(updateData)
      .returning('*');

    return updated;
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
}
