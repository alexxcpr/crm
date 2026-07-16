import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { CreateTabDto, UpdateTabDto } from '../dto/tab.dto';
import type { RankedItemDto } from '../dto/reorder.dto';
import { reorderRanks } from '../rank-reorder.util';

@Injectable()
export class AdminTabsService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  private async ensureEntityExists(entityId: string) {
    const entity = await this.knex('entity').where('id_entity', entityId).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${entityId}" nu exista.`);
    }
    return entity;
  }

  async findAllByEntity(entityId: string) {
    // Verify entity exists
    const entity = await this.knex('entity').where('id_entity', entityId).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${entityId}" nu exista.`);
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
        _count: { fields: Number(count) },
      });
    }

    return result;
  }

  async findOne(entityId: string, tabId: string) {
    const tab = await this.knex('ui_tab')
      .where({ id_entity: entityId, id_ui_tab: tabId })
      .first();

    if (!tab) {
      throw new NotFoundException(`Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`);
    }

    const [{ count }] = await this.knex('field')
      .where('id_ui_tab', tabId)
      .count('* as count');

    return {
      ...tab,
      _count: { fields: Number(count) },
    };
  }

  async create(entityId: string, dto: CreateTabDto) {
    // Verify entity exists
    const entity = await this.knex('entity').where('id_entity', entityId).first();
    if (!entity) {
      throw new NotFoundException(`Entitatea cu id "${entityId}" nu exista.`);
    }

    // Check slug uniqueness per entity
    const existing = await this.knex('ui_tab')
      .where({ id_entity: entityId, slug: dto.slug })
      .first();
    if (existing) {
      throw new ConflictException(`Un tab cu slug-ul "${dto.slug}" exista deja in aceasta entitate.`);
    }

    // Auto-assign rank if not specified or explicitly set to 0
    let rank = dto.rank;
    if (rank === undefined || rank === 0) {
      const maxRankResult = await this.knex('ui_tab')
        .where('id_entity', entityId)
        .max('rank as max_rank')
        .first();
      rank = ((maxRankResult?.max_rank as number) ?? 0) + 1;
    }

    const [tab] = await this.knex('ui_tab')
      .insert({
        id_entity: entityId,
        name: dto.name,
        slug: dto.slug,
        rank,
        is_system: dto.is_system ?? false,
      })
      .returning('*');

    return tab;
  }

  async update(entityId: string, tabId: string, dto: UpdateTabDto) {
    const tab = await this.knex('ui_tab')
      .where({ id_entity: entityId, id_ui_tab: tabId })
      .first();

    if (!tab) {
      throw new NotFoundException(`Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`);
    }

    // Check slug uniqueness (excluding self)
    if (dto.slug) {
      const slugConflict = await this.knex('ui_tab')
        .where({ id_entity: entityId, slug: dto.slug })
        .whereNot('id_ui_tab', tabId)
        .first();

      if (slugConflict) {
        throw new ConflictException(`Un tab cu slug-ul "${dto.slug}" exista deja in aceasta entitate.`);
      }
    }

    const updateData: Record<string, any> = {
      date_updated: new Date(),
    };

    if (dto.name !== undefined) updateData.name = dto.name;
    if (dto.slug !== undefined) updateData.slug = dto.slug;
    if (dto.rank !== undefined) updateData.rank = dto.rank;

    const [updated] = await this.knex('ui_tab')
      .where('id_ui_tab', tabId)
      .update(updateData)
      .returning('*');

    return updated;
  }

  async reorder(entityId: string, items: RankedItemDto[]) {
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
      .where({ id_entity: entityId, id_ui_tab: tabId })
      .first();

    if (!tab) {
      throw new NotFoundException(`Tab-ul cu id "${tabId}" nu exista in aceasta entitate.`);
    }

    // System tabs cannot be deleted
    if (tab.is_system) {
      throw new BadRequestException(`Tab-ul "${tab.name}" este un tab de sistem si nu poate fi sters.`);
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

    await this.knex('ui_tab').where('id_ui_tab', tabId).del();

    return { message: `Tab-ul "${tab.name}" a fost sters.` };
  }

  async removeMany(entityId: string, ids: string[]) {
    if (!ids || ids.length === 0) {
      throw new BadRequestException('Lista de id-uri este goala.');
    }

    const tabs = await this.knex('ui_tab')
      .where('id_entity', entityId)
      .whereIn('id_ui_tab', ids);

    if (tabs.length === 0) {
      throw new NotFoundException('Niciun tab gasit cu id-urile specificate.');
    }

    const errors: string[] = [];

    for (const tab of tabs) {
      if (tab.is_system) {
        errors.push(`Tab-ul "${tab.name}" este un tab de sistem si nu poate fi sters.`);
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
      throw new BadRequestException(errors.join(' '));
    }

    const nonSystemIds = tabs.filter((t) => !t.is_system).map((t) => t.id_ui_tab);
    const deletedCount = await this.knex('ui_tab')
      .whereIn('id_ui_tab', nonSystemIds)
      .del();

    return { message: `${deletedCount} tab-uri au fost sterse.` };
  }
}
