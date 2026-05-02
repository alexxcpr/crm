import { EntityEvent } from './entity-event.enum';

export interface EntityEventPayload {
  /** Tipul evenimentului */
  event: EntityEvent;

  /** Slug-ul tenant-ului curent */
  tenantSlug: string;

  /** Numele bazei de date a tenant-ului */
  tenantDb: string;

  /** Slug-ul entității (ex: "contacts", "deals") */
  entitySlug: string;

  /** Numele tabelului fizic (ex: "ent_contacts") */
  tableName: string;

  /** ID-ul entității din metadata (entity.id_entity) */
  entityId: string;

  /** ID-ul record-ului afectat (null pentru BeforeInsert) */
  recordId: string | null;

  /** Datele trimise de client (body-ul sanitizat) */
  data: Record<string, any>;

  /**
   * Datele existente înainte de operație.
   * Prezent doar pe Update și Delete.
   */
  previousData?: Record<string, any>;

  /** ID-ul utilizatorului care a inițiat operația */
  userId: string | null;

  /** Timestamp-ul evenimentului */
  timestamp: Date;
}
