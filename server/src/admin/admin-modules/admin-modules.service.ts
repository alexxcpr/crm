import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { ModuleDto } from '../dto/module.dto';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';

@Injectable()
export class AdminModulesService {
  constructor(private readonly tenantContext: TenantContext, private readonly authorization: AuthorizationService) {}

  private get knex() { return this.tenantContext.knex; }

  async findAll(user?: AuthenticatedUser) {
    const modules = await this.knex('module')
      .select('*')
      .orderBy('rank', 'asc');

    const result: any[] = [];
    for (const mod of modules) {
      let entities = await this.knex('entity')
        .select('id_entity', 'name', 'slug', 'icon', 'label_plural', 'rank')
        .where('id_module', mod.id_module)
        .orderBy('rank', 'asc');
      if (user && !user.roles.includes('admin')) {
        const visible: any[] = [];
        for (const entity of entities) {
          if (await this.authorization.getScope(user, entity.id_entity, 'read')) visible.push(entity);
        }
        entities = visible;
      }

      const [{ count }] = await this.knex('entity')
        .where('id_module', mod.id_module)
        .count('* as count');

      if (entities.length || user?.roles.includes('admin') || !user) result.push({
        ...mod,
        entities,
        _count: { entities: Number(count) },
      });
    }

    return result;
  }

  async findOne(id: string) {
    const mod = await this.knex('module').where('id_module', id).first();
    if (!mod) {
      throw new NotFoundException(`Modului cu id "${id}" nu exista.`);
    }

    const entities = await this.knex('entity')
      .select('id_entity', 'name', 'slug', 'icon', 'is_system', 'rank')
      .where('id_module', id)
      .orderBy('rank', 'asc');

    return { ...mod, entities };
  }

  async create(dto: ModuleDto) {
    const existing = await this.knex('module').where('slug', dto.slug).first();
    if (existing) {
      throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit.`);
    }

    const [mod] = await this.knex('module')
      .insert({
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon ?? null,
        rank: dto.rank ?? 0,
        is_active: dto.is_active ?? true,
      })
      .returning('*');

    return mod;
  }

  async update(id: string, dto: ModuleDto) {
    const mod = await this.knex('module').where('id_module', id).first();
    if (!mod) {
      throw new NotFoundException(`Modulul cu id "${id}" nu exista.`);
    }

    const slugConflict = await this.knex('module')
      .where('slug', dto.slug)
      .whereNot('id_module', id)
      .first();

    if (slugConflict) {
      throw new ConflictException(`Slug-ul "${dto.slug}" este deja folosit de alt modul.`);
    }

    const [updated] = await this.knex('module')
      .where('id_module', id)
      .update({
        name: dto.name,
        slug: dto.slug,
        icon: dto.icon ?? null,
        rank: dto.rank ?? 0,
        is_active: dto.is_active ?? true,
        date_updated: new Date(),
      })
      .returning('*');

    return updated;
  }

  async remove(id: string) {
    const mod = await this.knex('module').where('id_module', id).first();
    if (!mod) {
      throw new NotFoundException(`Modulul cu id "${id}" nu exista.`);
    }

    const [{ count }] = await this.knex('entity')
      .where('id_module', id)
      .count('* as count');

    if (Number(count) > 0) {
      throw new BadRequestException(
        `Modulul "${mod.name}" contine ${count} entitati. Muta sau sterge entitatile inainte.`,
      );
    }

    await this.knex('module').where('id_module', id).del();

    return { message: `Modulul "${mod.name}" a fost sters.` };
  }

  async removeMany(ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('Lista de id-uri este goala.');
    }

    const modules = await this.knex('module').whereIn('id_module', ids);
    const errors: string[] = [];

    for (const mod of modules) {
      const [{ count }] = await this.knex('entity')
        .where('id_module', mod.id_module)
        .count('* as count');

      if (Number(count) > 0) {
        errors.push(
          `Modulul "${mod.name}" contine ${count} entitati. Muta sau sterge entitatile inainte.`,
        );
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException(errors.join(' '));
    }

    const deletedCount = await this.knex('module')
      .whereIn('id_module', ids)
      .del();

    return { message: `${deletedCount} module au fost sterse.` };
  }
}
