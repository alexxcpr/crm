import { Injectable } from '@nestjs/common';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { MenuLinkType } from 'src/admin/dto/menu.dto';
import { DashboardService } from 'src/dashboards/dashboard.service';

interface MenuItemRow {
  id_menu_item: string;
  id_menu: string;
  name: string;
  icon: string | null;
  rank: number;
  open_link: string;
  link_type: MenuLinkType;
  id_entity: string | null;
  record_id: string | null;
  id_ui_dashboard: string | null;
  is_active: boolean;
}

interface NavigationMenuItem {
  id_menu_item: string;
  name: string;
  icon: string | null;
  rank: number;
  open_link: string;
  link_type: MenuLinkType;
  is_external: boolean;
}

@Injectable()
export class NavigationMenuService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authorization: AuthorizationService,
    private readonly dashboards: DashboardService,
  ) {}

  private get knex() { return this.tenantContext.knex; }

  async getMenu(user: AuthenticatedUser) {
    const menus = await this.knex('menu')
      .select('id_menu', 'name', 'icon', 'rank')
      .where('is_active', true)
      .orderBy('rank', 'asc');

    const result: any[] = [];

    for (const menu of menus) {
      const items = await this.knex<MenuItemRow>('menu_item')
        .select('id_menu_item', 'id_menu', 'name', 'icon', 'rank', 'open_link', 'link_type', 'id_entity', 'record_id', 'id_ui_dashboard', 'is_active')
        .where('id_menu', menu.id_menu)
        .where('is_active', true)
        .orderBy('rank', 'asc');

      const visibleItems: NavigationMenuItem[] = [];
      for (const item of items) {
        if (await this.canSeeItem(user, item)) {
          visibleItems.push({
            id_menu_item: item.id_menu_item,
            name: item.name,
            icon: item.icon,
            rank: item.rank,
            open_link: item.open_link,
            link_type: item.link_type,
            is_external: item.link_type === 'external_url',
          });
        }
      }

      if (visibleItems.length) {
        result.push({ ...menu, items: visibleItems });
      }
    }

    return result;
  }

  private async canSeeItem(user: AuthenticatedUser, item: MenuItemRow) {
    if (item.link_type === 'dashboard') {
      return Boolean(item.id_ui_dashboard && await this.dashboards.canViewDashboard(item.id_ui_dashboard, user));
    }
    if (item.link_type === 'external_url' || item.link_type === 'internal_route') return true;
    if (!item.id_entity) return false;

    const action = item.link_type === 'entity_create' ? 'create' : 'read';
    return Boolean(await this.authorization.getScope(user, item.id_entity, action));
  }
}
