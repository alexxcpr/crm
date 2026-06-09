import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DynamicSchemaService } from 'src/dynamic-schema/dynamic-schema.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { CreateEntityDto, UpdateEntityDto } from '../dto/entity.dto';

@Injectable()
export class AdminEntitiesService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly dynamicSchema: DynamicSchemaService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async findAll(moduleId?: string) {
    let query = this.knex('entity').orderBy('rank', 'asc');

    if (moduleId) {
      query = query.where('entity.id_module', moduleId);
    }

    const entities = await query.select('entity.*');

    const result: any[] = [];
    for (const ent of entities) {
      const mod = ent.id_module
        ? await this.knex('module')
            .select('id_module', 'name', 'slug')
            .where('id_module', ent.id_module)
            .first()
        : null;

      const [{ count }] = await this.knex('field')
        .where('id_entity', ent.id_entity)
        .count('* as count');

      result.push({
        ...ent,
        module: mod ?? null,
        _count: { fields: Number(count) },
      });
    }

    return result;
  }

  async findOne(id: string) {
    const entity = await this.knex('entity').where('id_entity', id).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
    }

    const mod = entity.id_module
      ? await this.knex('module')
          .select('id_module', 'name', 'slug')
          .where('id_module', entity.id_module)
          .first()
      : null;

    const fields = await this.knex('field')
      .leftJoin('ui_tab', 'field.id_ui_tab', 'ui_tab.id_ui_tab')
      .where('field.id_entity', id)
      .orderBy([
        { column: 'ui_tab.rank', order: 'asc' },
        { column: 'field.rank', order: 'asc' },
      ])
      .select('field.*');

    return { ...entity, module: mod ?? null, fields };
  }

  async create(dto: CreateEntityDto) {
    const existing = await this.knex('entity').where('slug', dto.slug).first();
    if (existing) {
      throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit de o alta entitate.`);
    }

    if (dto.id_module) {
      const moduleExists = await this.knex('module').where('id_module', dto.id_module).first();
      if (!moduleExists) {
        throw new NotFoundException(`Modului cu id "${dto.id_module}" nu exista.`);
      }
    }

    const tableName = `ent_${dto.slug}`;

    const [entity] = await this.knex('entity')
      .insert({
        name: dto.name,
        slug: dto.slug,
        table_name: tableName,
        id_module: dto.id_module ?? null,
        icon: dto.icon ?? null,
        label_singular: dto.label_singular ?? null,
        label_plural: dto.label_plural ?? null,
        rank: dto.rank ?? 0,
        is_system: false,
      })
      .returning('*');

    await this.dynamicSchema.createEntityTable(entity);

    // Auto-create "General" tab
    await this.knex('ui_tab').insert({
      id_entity: entity.id_entity,
      name: 'General',
      slug: 'general',
      rank: 0,
      is_system: true,
    });

    return entity;
  }

  async update(id: string, dto: UpdateEntityDto) {
    const entity = await this.knex('entity').where('id_entity', id).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
    }

    const [updated] = await this.knex('entity')
      .where('id_entity', id)
      .update({
        name: dto.name ?? entity.name,
        id_module: dto.id_module !== undefined ? dto.id_module : entity.id_module,
        icon: dto.icon !== undefined ? dto.icon : entity.icon,
        label_singular: dto.label_singular !== undefined ? dto.label_singular : entity.label_singular,
        label_plural: dto.label_plural !== undefined ? dto.label_plural : entity.label_plural,
        rank: dto.rank ?? entity.rank,
        date_updated: new Date(),
      })
      .returning('*');

    return updated;
  }

  async remove(id: string) {
    const entity = await this.knex('entity').where('id_entity', id).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${id}" nu exista.`);
    }

    if (entity.is_system) {
      throw new BadRequestException(
        `Entitatea "${entity.name}" este o entitate de sistem si nu poate fi stearsa.`,
      );
    }

    await this.knex('entity').where('id_entity', id).del();

    return { message: `Entitatea "${entity.name}" a fost stearsa cu succes.` };
  }

  async removeMany(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('Lista de id-uri este goala.');
    }

    const entities = await this.knex('entity').whereIn('id_entity', ids);
    const errors: string[] = [];

    for (const ent of entities) {
      if (ent.is_system) {
        errors.push(
          `Entitatea "${ent.name}" este o entitate de sistem si nu poate fi stearsa.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const deletedCount = await this.knex('entity')
      .whereIn('id_entity', ids)
      .del();

    return { message: `${deletedCount} entitati au fost sterse.` };
  }
}
