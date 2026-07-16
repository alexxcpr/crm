import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { MenuDto, MenuItemDto } from '../dto/menu.dto';
import type { RankedItemDto } from '../dto/reorder.dto';
import { reorderRanks } from '../rank-reorder.util';

@Injectable()
export class AdminMenusService {
  constructor(private readonly tenantContext: TenantContext) {}

  private get knex() { return this.tenantContext.knex; }

  async findAll() {
    const menus = await this.knex('menu').select('*').orderBy('rank', 'asc');
    const result: any[] = [];

    for (const menu of menus) {
      const items = await this.knex('menu_item')
        .select('*')
        .where('id_menu', menu.id_menu)
        .orderBy('rank', 'asc');

      result.push({ ...menu, items, _count: { items: items.length } });
    }

    return result;
  }

  async findOne(id: string) {
    const menu = await this.knex('menu').where('id_menu', id).first();
    if (!menu) throw new NotFoundException(`Meniul cu id "${id}" nu exista.`);

    const items = await this.knex('menu_item')
      .select('*')
      .where('id_menu', id)
      .orderBy('rank', 'asc');

    return { ...menu, items };
  }

  async create(dto: MenuDto) {
    const maxRank = await this.knex('menu').max('rank as max_rank').first();
    const [menu] = await this.knex('menu')
      .insert({
        name: dto.name,
        icon: dto.icon || null,
        rank: dto.rank ?? Number(maxRank?.max_rank ?? 0) + 1,
        is_active: dto.is_active ?? true,
      })
      .returning('*');

    return menu;
  }

  async reorder(items: RankedItemDto[]) {
    await reorderRanks(this.knex, {
      table: 'menu',
      idColumn: 'id_menu',
      items,
    });
    return this.findAll();
  }

  async update(id: string, dto: MenuDto) {
    const menu = await this.knex('menu').where('id_menu', id).first();
    if (!menu) throw new NotFoundException(`Meniul cu id "${id}" nu exista.`);

    const [updated] = await this.knex('menu')
      .where('id_menu', id)
      .update({
        name: dto.name,
        icon: dto.icon || null,
        rank: dto.rank ?? 0,
        is_active: dto.is_active ?? true,
        date_updated: new Date(),
      })
      .returning('*');

    return updated;
  }

  async remove(id: string) {
    const menu = await this.knex('menu').where('id_menu', id).first();
    if (!menu) throw new NotFoundException(`Meniul cu id "${id}" nu exista.`);

    await this.knex('menu').where('id_menu', id).del();
    return { message: `Meniul "${menu.name}" a fost sters.` };
  }

  async createItem(menuId: string, dto: MenuItemDto) {
    await this.ensureMenu(menuId);
    await this.validateItem(dto);

    if (dto.rank === undefined || dto.rank === 0) {
      const maxRank = await this.knex('menu_item')
        .where('id_menu', menuId)
        .max('rank as max_rank')
        .first();
      dto.rank = Number(maxRank?.max_rank ?? 0) + 1;
    }

    const [item] = await this.knex('menu_item')
      .insert(this.toItemInsert(menuId, dto))
      .returning('*');

    return item;
  }

  async reorderItems(items: RankedItemDto[]) {
    const ids = items.map((item) => item.id);
    const menuItems = await this.knex('menu_item')
      .select('id_menu_item', 'id_menu')
      .whereIn('id_menu_item', ids);

    if (menuItems.length !== items.length) {
      throw new BadRequestException('Lista de reordonare contine elemente inexistente.');
    }

    const menuIds = new Set(menuItems.map((item) => item.id_menu));
    if (menuIds.size !== 1) {
      throw new BadRequestException('Elementele pot fi reordonate doar in interiorul aceluiasi meniu.');
    }

    const menuId = menuItems[0].id_menu;
    await reorderRanks(this.knex, {
      table: 'menu_item',
      idColumn: 'id_menu_item',
      items,
      scope: { id_menu: menuId },
    });
    const menu = await this.findOne(menuId);
    return menu.items;
  }

  async updateItem(id: string, dto: MenuItemDto) {
    const item = await this.knex('menu_item').where('id_menu_item', id).first();
    if (!item) throw new NotFoundException(`Elementul de meniu cu id "${id}" nu exista.`);

    await this.validateItem(dto);

    const [updated] = await this.knex('menu_item')
      .where('id_menu_item', id)
      .update({
        ...this.toItemInsert(item.id_menu, dto),
        date_updated: new Date(),
      })
      .returning('*');

    return updated;
  }

  async removeItem(id: string) {
    const item = await this.knex('menu_item').where('id_menu_item', id).first();
    if (!item) throw new NotFoundException(`Elementul de meniu cu id "${id}" nu exista.`);

    await this.knex('menu_item').where('id_menu_item', id).del();
    return { message: `Elementul "${item.name}" a fost sters.` };
  }

  private async ensureMenu(id: string) {
    const menu = await this.knex('menu').where('id_menu', id).first();
    if (!menu) throw new NotFoundException(`Meniul cu id "${id}" nu exista.`);
  }

  private async validateItem(dto: MenuItemDto) {
    const openLink = dto.open_link.trim();
    if (!openLink) throw new BadRequestException('Link-ul este obligatoriu.');

    if (dto.link_type === 'external_url') {
      this.validateExternalUrl(openLink);
    } else {
      this.validateInternalRoute(openLink);
    }

    if (dto.link_type.startsWith('entity_')) {
      if (!dto.id_entity) throw new BadRequestException('Entitatea este obligatorie pentru linkurile catre entitati.');

      const entity = await this.knex('entity').where('id_entity', dto.id_entity).first();
      if (!entity) throw new BadRequestException('Entitatea selectata nu exista.');
    }

    if (dto.link_type === 'entity_record' && !dto.record_id) {
      throw new BadRequestException('ID-ul inregistrarii este obligatoriu pentru linkurile catre inregistrari.');
    }

    if (dto.link_type === 'dashboard') {
      if (!dto.id_ui_dashboard) throw new BadRequestException('Dashboard-ul este obligatoriu pentru acest tip de link.');
      const dashboard = await this.knex('ui_dashboard')
        .where({ id_ui_dashboard: dto.id_ui_dashboard, is_active: true })
        .first();
      if (!dashboard) throw new BadRequestException('Dashboard-ul selectat nu exista sau este inactiv.');
      if (openLink !== `/dashboards/${dashboard.slug}`) {
        throw new BadRequestException('Link-ul dashboard-ului nu corespunde dashboard-ului selectat.');
      }
    }
  }

  private validateExternalUrl(openLink: string) {
    let url: URL;
    try {
      url = new URL(openLink);
    } catch {
      throw new BadRequestException('URL-ul extern nu este valid.');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('URL-ul extern trebuie sa inceapa cu http:// sau https://.');
    }
  }

  private validateInternalRoute(openLink: string) {
    if (!openLink.startsWith('/') || openLink.startsWith('//')) {
      throw new BadRequestException('Rutele interne trebuie sa inceapa cu "/".');
    }

    const unsafeScheme = /^[a-z][a-z0-9+.-]*:/i.test(openLink);
    if (unsafeScheme) {
      throw new BadRequestException('Link-ul contine o schema nepermisa.');
    }
  }

  private toItemInsert(menuId: string, dto: MenuItemDto) {
    return {
      id_menu: menuId,
      name: dto.name,
      icon: dto.icon || null,
      rank: dto.rank ?? 0,
      open_link: dto.open_link.trim(),
      link_type: dto.link_type,
      id_entity: dto.id_entity || null,
      record_id: dto.record_id || null,
      id_ui_dashboard: dto.id_ui_dashboard || null,
      is_active: dto.is_active ?? true,
    };
  }
}
