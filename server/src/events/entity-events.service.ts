import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { EntityEvent } from './entity-event.enum';
import { EntityEventPayload } from './entity-event.payload';

@Injectable()
export class EntityEventsService {
  private readonly logger = new Logger(EntityEventsService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Emite un eveniment sincron.
   * "Before" events pot fi folosite pentru validare/blocare.
   * "After" events pentru side-effects (audit, triggers, etc.)
   */
  async emit(
    event: EntityEvent,
    context: {
      entitySlug: string;
      tableName: string;
      entityId: string;
      recordId: string | null;
      data: Record<string, any>;
      previousData?: Record<string, any>;
      userId: string | null;
      profileId: string | null;
    },
  ): Promise<void> {
    const payload: EntityEventPayload = {
      event,
      tenantSlug: this.tenantContext.slug,
      tenantDb: this.tenantContext.dbName,
      entitySlug: context.entitySlug,
      tableName: context.tableName,
      entityId: context.entityId,
      recordId: context.recordId,
      data: context.data,
      previousData: context.previousData,
      userId: context.userId,
      profileId: context.profileId,
      timestamp: new Date(),
    };

    this.logger.debug(
      `${event} → ${context.entitySlug}${context.recordId ? `#${context.recordId}` : ''}`,
    );

    // Emite evenimentul generic (ex: "entity.before_insert")
    await this.eventEmitter.emitAsync(event, payload);

    // Emite și evenimentul specific per entitate (ex: "entity.before_insert.contacts")
    await this.eventEmitter.emitAsync(`${event}.${context.entitySlug}`, payload);
  }
}
