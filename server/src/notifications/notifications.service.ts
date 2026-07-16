import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthorizationService } from 'src/security/authorization.service';
import { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { CreateWorkflowNotificationDto, ListNotificationsQueryDto } from './dto';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly authorization: AuthorizationService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async findAll(profileId: string, query: ListNotificationsQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const search = query.search?.trim();

    const applyFilters = (builder: any) => {
      builder.where('notification.id_profile', profileId);
      if (query.status === 'unread') builder.where('notification.is_read', false);
      if (search) {
        builder.andWhere((nested: any) => {
          nested
            .whereILike('notification.subject', `%${search}%`)
            .orWhereILike('notification.content', `%${search}%`);
        });
      }
    };

    const dataQuery = this.knex('notification')
      .leftJoin('entity', 'notification.id_target_entity', 'entity.id_entity')
      .select(
        'notification.id_notification',
        'notification.subject',
        'notification.content',
        'notification.is_read',
        'notification.date_read',
        'notification.target_record_id',
        'notification.date_created',
        'notification.date_updated',
        'entity.slug as target_entity_slug',
      );
    applyFilters(dataQuery);

    const countQuery = this.knex('notification').count<{ count: string }[]>({ count: '*' });
    applyFilters(countQuery);

    const unreadQuery = this.knex('notification')
      .where({ id_profile: profileId, is_read: false })
      .count<{ count: string }[]>({ count: '*' });

    const [data, countRows, unreadRows] = await Promise.all([
      dataQuery
        .orderBy('notification.date_created', 'desc')
        .limit(limit)
        .offset((page - 1) * limit),
      countQuery,
      unreadQuery,
    ]);

    const total = Number(countRows[0]?.count ?? 0);
    const unreadCount = Number(unreadRows[0]?.count ?? 0);
    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      unreadCount,
    };
  }

  async unreadCount(profileId: string) {
    const rows = await this.knex('notification')
      .where({ id_profile: profileId, is_read: false })
      .count<{ count: string }[]>({ count: '*' });
    return { data: { count: Number(rows[0]?.count ?? 0) } };
  }

  async setRead(profileId: string, notificationId: string, isRead: boolean) {
    const now = new Date();
    const [notification] = await this.knex('notification')
      .where({ id_notification: notificationId, id_profile: profileId })
      .update({
        is_read: isRead,
        date_read: isRead ? now : null,
        date_updated: now,
      })
      .returning('*');

    if (!notification) throw new NotFoundException('Notificarea nu a fost gasita.');
    return { data: notification };
  }

  async markAllRead(profileId: string) {
    const now = new Date();
    const updated = await this.knex('notification')
      .where({ id_profile: profileId, is_read: false })
      .update({ is_read: true, date_read: now, date_updated: now });
    return { data: { updated } };
  }

  async createFromWorkflow(dto: CreateWorkflowNotificationDto, _actor: AuthenticatedUser) {
    const subject = dto.subject.trim();
    const content = dto.content.trim();
    if (!subject) throw new BadRequestException('Subiectul notificarii este obligatoriu.');
    if (!content) throw new BadRequestException('Continutul notificarii este obligatoriu.');
    if (!!dto.targetEntitySlug !== !!dto.targetRecordId) {
      throw new BadRequestException('Destinatia notificarii este incompleta.');
    }

    const recipient = await this.buildRecipientActor(dto.recipientProfileId);
    let targetEntity: Record<string, any> | null = null;

    if (dto.targetEntitySlug && dto.targetRecordId) {
      const resolvedTarget = await this.authorization.getEntity(dto.targetEntitySlug);
      targetEntity = resolvedTarget;
      const scope = await this.authorization.require(recipient, resolvedTarget.id_entity, 'read');
      const recordQuery = this.knex(resolvedTarget.table_name).where('id', dto.targetRecordId);
      this.authorization.applyScope(recordQuery, resolvedTarget.table_name, scope, recipient.profileId);
      const record = await recordQuery.first('id');
      if (!record) {
        throw new NotFoundException('Recordul destinatie nu exista sau destinatarul nu are acces la el.');
      }
    }

    const insert = {
      id_profile: recipient.profileId,
      subject,
      content,
      id_target_entity: targetEntity?.id_entity ?? null,
      target_record_id: dto.targetRecordId ?? null,
      source_execution_id: dto.sourceExecutionId,
      source_node_id: dto.sourceNodeId,
      source_run_index: dto.sourceRunIndex,
      source_item_index: dto.sourceItemIndex,
      date_created: new Date(),
      date_updated: new Date(),
    };

    const inserted = await this.knex('notification')
      .insert(insert)
      .onConflict([
        'source_execution_id',
        'source_node_id',
        'source_run_index',
        'source_item_index',
      ])
      .ignore()
      .returning('*');

    const notification = inserted[0] ?? await this.knex('notification').where({
      source_execution_id: dto.sourceExecutionId,
      source_node_id: dto.sourceNodeId,
      source_run_index: dto.sourceRunIndex,
      source_item_index: dto.sourceItemIndex,
    }).first();

    return { data: notification, created: inserted.length > 0 };
  }

  private async buildRecipientActor(profileId: string): Promise<AuthenticatedUser> {
    const row = await this.knex('profile')
      .join('user', 'profile.id_user', 'user.id')
      .where({
        'profile.id_profile': profileId,
        'profile.is_active': true,
        'user.is_active': true,
      })
      .select(
        'profile.*',
        'user.id',
        'user.login_username',
        'user.must_change_password',
        'user.is_active as user_is_active',
      )
      .first();

    if (!row) throw new NotFoundException('Profilul destinatar nu exista sau este inactiv.');

    const roles = await this.knex('profile_role')
      .join('role', 'profile_role.id_role', 'role.id_role')
      .where('profile_role.id_profile', profileId)
      .select('role.slug');

    return {
      id: row.id,
      login_username: row.login_username,
      must_change_password: row.must_change_password,
      is_active: row.user_is_active,
      profile: {
        id_profile: row.id_profile,
        id_user: row.id_user,
        username: row.username,
        email: row.email,
        display_name: row.display_name,
        is_default: row.is_default,
        is_active: row.is_active,
      },
      profileId: row.id_profile,
      roles: roles.map((role: { slug: string }) => role.slug),
      tenant: this.tenantContext.slug,
      dbName: this.tenantContext.dbName,
    };
  }
}
