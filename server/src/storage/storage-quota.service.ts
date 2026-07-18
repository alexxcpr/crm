import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Knex } from 'knex';
import { MetaDbService } from 'src/tenant/meta-db.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type { StorageUsageState } from './storage.types';
import {
  buildStorageUsageState,
  calculateQuotaBytes,
} from './storage-quota.utils';

interface TenantStorageRow {
  id: string;
  slug: string;
  included_storage_gb: number;
  extra_storage_units: number;
}

export interface ReserveStorageInput {
  idReservation: string;
  fileId: string;
  ownerProfileId: string;
  idempotencyKey: string;
  temporaryObjectKey: string;
  finalObjectKey: string;
  expectedBytes: number;
  expiresAt: Date;
}

@Injectable()
export class StorageQuotaService {
  constructor(
    private readonly metaDb: MetaDbService,
    private readonly tenantContext: TenantContext,
  ) {}

  async state(
    slug = this.tenantContext.slug,
  ): Promise<StorageUsageState> {
    const tenant = await this.tenantBySlug(
      this.metaDb.knex,
      slug,
    );
    await this.ensureUsageRow(
      this.metaDb.knex,
      tenant.id,
    );
    const usage = await this.metaDb
      .knex('tenant_storage_usage')
      .where({ tenant_id: tenant.id })
      .first();
    return this.toState(tenant, usage);
  }

  async reserve(
    input: ReserveStorageInput,
    slug = this.tenantContext.slug,
  ) {
    return this.metaDb.knex.transaction(
      async (trx) => {
        const tenant = await this.tenantBySlug(
          trx,
          slug,
          true,
        );
        const existing = await trx(
          'tenant_storage_reservation',
        )
          .where({
            tenant_id: tenant.id,
            idempotency_key: input.idempotencyKey,
          })
          .first();

        if (existing) {
          if (
            [
              'pending',
              'finalizing',
              'completed',
            ].includes(existing.status)
          ) {
            if (
              existing.status !== 'completed' &&
              new Date(
                existing.expires_at,
              ).getTime() <= Date.now()
            ) {
              throw new ConflictException(
                'Sesiunea de upload a expirat. Incearca din nou.',
              );
            }
            return {
              reservation: existing,
              created: false,
            };
          }
          throw new ConflictException(
            'Sesiunea de upload anterioara nu mai poate fi refolosita. Incearca din nou.',
          );
        }

        await this.ensureUsageRow(trx, tenant.id);
        const usage = await trx(
          'tenant_storage_usage',
        )
          .where({ tenant_id: tenant.id })
          .forUpdate()
          .first();
        const requested = BigInt(
          input.expectedBytes,
        );
        const quota = calculateQuotaBytes(tenant);
        const used = BigInt(usage.used_bytes);
        const reserved = BigInt(
          usage.reserved_bytes,
        );

        if (used + reserved + requested > quota) {
          const remaining =
            quota > used + reserved
              ? quota - used - reserved
              : 0n;
          throw new PayloadTooLargeException(
            `Spatiul disponibil al tenantului este insuficient. Au ramas ${this.formatBytes(remaining)}.`,
          );
        }

        await trx('tenant_storage_usage')
          .where({ tenant_id: tenant.id })
          .update({
            reserved_bytes: (
              reserved + requested
            ).toString(),
            updated_at: trx.fn.now(),
          });

        const [reservation] = await trx(
          'tenant_storage_reservation',
        )
          .insert({
            id_reservation: input.idReservation,
            tenant_id: tenant.id,
            file_id: input.fileId,
            owner_profile_id:
              input.ownerProfileId,
            idempotency_key: input.idempotencyKey,
            temporary_object_key:
              input.temporaryObjectKey,
            final_object_key:
              input.finalObjectKey,
            expected_bytes: input.expectedBytes,
            status: 'pending',
            expires_at: input.expiresAt,
          })
          .returning('*');

        return { reservation, created: true };
      },
    );
  }

  async getReservation(
    fileId: string,
    slug = this.tenantContext.slug,
  ) {
    const tenant = await this.tenantBySlug(
      this.metaDb.knex,
      slug,
    );
    const row = await this.metaDb
      .knex('tenant_storage_reservation')
      .where({
        tenant_id: tenant.id,
        file_id: fileId,
      })
      .first();
    if (!row)
      throw new NotFoundException(
        'Sesiunea de upload nu exista.',
      );
    return row;
  }

  async markFinalizing(
    fileId: string,
    slug = this.tenantContext.slug,
  ) {
    return this.metaDb.knex.transaction(
      async (trx) => {
        const tenant = await this.tenantBySlug(
          trx,
          slug,
        );
        const row = await trx(
          'tenant_storage_reservation',
        )
          .where({
            tenant_id: tenant.id,
            file_id: fileId,
          })
          .forUpdate()
          .first();
        if (!row)
          throw new NotFoundException(
            'Sesiunea de upload nu exista.',
          );
        if (row.status === 'completed')
          return row;
        if (
          !['pending', 'finalizing'].includes(
            row.status,
          )
        ) {
          throw new ConflictException(
            'Sesiunea de upload nu mai poate fi finalizata.',
          );
        }
        if (
          new Date(row.expires_at).getTime() <=
          Date.now()
        ) {
          throw new ConflictException(
            'Sesiunea de upload a expirat.',
          );
        }
        const [updated] = await trx(
          'tenant_storage_reservation',
        )
          .where({
            id_reservation: row.id_reservation,
          })
          .update({
            status: 'finalizing',
            updated_at: trx.fn.now(),
          })
          .returning('*');
        return updated;
      },
    );
  }

  async complete(
    fileId: string,
    slug = this.tenantContext.slug,
  ) {
    return this.metaDb.knex.transaction(
      async (trx) => {
        const tenant = await this.tenantBySlug(
          trx,
          slug,
          true,
        );
        const reservation = await trx(
          'tenant_storage_reservation',
        )
          .where({
            tenant_id: tenant.id,
            file_id: fileId,
          })
          .forUpdate()
          .first();
        if (!reservation)
          throw new NotFoundException(
            'Sesiunea de upload nu exista.',
          );
        if (reservation.status === 'completed')
          return reservation;
        if (
          !['pending', 'finalizing'].includes(
            reservation.status,
          )
        ) {
          throw new ConflictException(
            'Sesiunea de upload nu poate fi confirmata.',
          );
        }

        await this.ensureUsageRow(trx, tenant.id);
        const usage = await trx(
          'tenant_storage_usage',
        )
          .where({ tenant_id: tenant.id })
          .forUpdate()
          .first();
        const expected = BigInt(
          reservation.expected_bytes,
        );
        const reserved = BigInt(
          usage.reserved_bytes,
        );
        if (reserved < expected) {
          throw new ConflictException(
            'Contorul de storage necesita reconciliere inainte de confirmare.',
          );
        }

        await trx('tenant_storage_usage')
          .where({ tenant_id: tenant.id })
          .update({
            reserved_bytes: (
              reserved - expected
            ).toString(),
            used_bytes: (
              BigInt(usage.used_bytes) + expected
            ).toString(),
            updated_at: trx.fn.now(),
          });
        const [updated] = await trx(
          'tenant_storage_reservation',
        )
          .where({
            id_reservation:
              reservation.id_reservation,
          })
          .update({
            status: 'completed',
            completed_at: trx.fn.now(),
            updated_at: trx.fn.now(),
            error_code: null,
          })
          .returning('*');
        return updated;
      },
    );
  }

  async fail(
    fileId: string,
    status: 'failed' | 'expired' = 'failed',
    errorCode?: string,
    slug = this.tenantContext.slug,
  ) {
    const tenant = await this.tenantBySlug(
      this.metaDb.knex,
      slug,
    );
    return this.releaseReserved(
      tenant.id,
      fileId,
      status,
      errorCode,
    );
  }

  async releaseReserved(
    tenantId: string,
    fileId: string,
    status: 'failed' | 'expired',
    errorCode?: string,
  ) {
    return this.metaDb.knex.transaction(
      async (trx) => {
        const reservation = await trx(
          'tenant_storage_reservation',
        )
          .where({
            tenant_id: tenantId,
            file_id: fileId,
          })
          .forUpdate()
          .first();
        if (
          !reservation ||
          [
            'failed',
            'expired',
            'deleted',
          ].includes(reservation.status)
        )
          return reservation ?? null;
        if (reservation.status === 'completed')
          return reservation;

        await this.ensureUsageRow(trx, tenantId);
        const usage = await trx(
          'tenant_storage_usage',
        )
          .where({ tenant_id: tenantId })
          .forUpdate()
          .first();
        const expected = BigInt(
          reservation.expected_bytes,
        );
        const reserved = BigInt(
          usage.reserved_bytes,
        );
        await trx('tenant_storage_usage')
          .where({ tenant_id: tenantId })
          .update({
            reserved_bytes: (reserved >= expected
              ? reserved - expected
              : 0n
            ).toString(),
            updated_at: trx.fn.now(),
          });
        const [updated] = await trx(
          'tenant_storage_reservation',
        )
          .where({
            id_reservation:
              reservation.id_reservation,
          })
          .update({
            status,
            error_code: errorCode ?? null,
            updated_at: trx.fn.now(),
          })
          .returning('*');
        return updated;
      },
    );
  }

  async deleteCompleted(
    fileId: string,
    slug = this.tenantContext.slug,
  ) {
    const tenant = await this.tenantBySlug(
      this.metaDb.knex,
      slug,
    );
    return this.deleteCompletedForTenant(
      tenant.id,
      fileId,
    );
  }

  async deleteCompletedForTenant(
    tenantId: string,
    fileId: string,
  ) {
    return this.metaDb.knex.transaction(
      async (trx) => {
        const reservation = await trx(
          'tenant_storage_reservation',
        )
          .where({
            tenant_id: tenantId,
            file_id: fileId,
          })
          .forUpdate()
          .first();
        if (
          !reservation ||
          reservation.status === 'deleted'
        )
          return reservation ?? null;
        if (reservation.status !== 'completed') {
          throw new BadRequestException(
            'Doar un fisier confirmat poate fi scazut din spatiul utilizat.',
          );
        }

        await this.ensureUsageRow(trx, tenantId);
        const usage = await trx(
          'tenant_storage_usage',
        )
          .where({ tenant_id: tenantId })
          .forUpdate()
          .first();
        const expected = BigInt(
          reservation.expected_bytes,
        );
        const used = BigInt(usage.used_bytes);
        await trx('tenant_storage_usage')
          .where({ tenant_id: tenantId })
          .update({
            used_bytes: (used >= expected
              ? used - expected
              : 0n
            ).toString(),
            updated_at: trx.fn.now(),
          });
        const [updated] = await trx(
          'tenant_storage_reservation',
        )
          .where({
            id_reservation:
              reservation.id_reservation,
          })
          .update({
            status: 'deleted',
            deleted_at: trx.fn.now(),
            updated_at: trx.fn.now(),
          })
          .returning('*');
        return updated;
      },
    );
  }

  async recalculateAllCounters(): Promise<void> {
    await this.metaDb.knex.transaction(
      async (trx) => {
        const tenants =
          await trx('tenants').select('id');
        for (const tenant of tenants) {
          const [usedRow, reservedRow] =
            await Promise.all([
              trx('tenant_storage_reservation')
                .where({
                  tenant_id: tenant.id,
                  status: 'completed',
                })
                .sum('expected_bytes as total')
                .first(),
              trx('tenant_storage_reservation')
                .where({ tenant_id: tenant.id })
                .whereIn('status', [
                  'pending',
                  'finalizing',
                ])
                .sum('expected_bytes as total')
                .first(),
            ]);
          await trx('tenant_storage_usage')
            .insert({
              tenant_id: tenant.id,
              used_bytes: usedRow?.total ?? 0,
              reserved_bytes:
                reservedRow?.total ?? 0,
              updated_at: trx.fn.now(),
            })
            .onConflict('tenant_id')
            .merge({
              used_bytes: usedRow?.total ?? 0,
              reserved_bytes:
                reservedRow?.total ?? 0,
              updated_at: trx.fn.now(),
            });
        }
      },
    );
  }

  private async tenantBySlug(
    db: Knex | Knex.Transaction,
    slug: string,
    forUpdate = false,
  ): Promise<TenantStorageRow> {
    let query = db<TenantStorageRow>('tenants')
      .select(
        'id',
        'slug',
        'included_storage_gb',
        'extra_storage_units',
      )
      .where({ slug });
    if (forUpdate) query = query.forUpdate();
    const tenant = await query.first();
    if (!tenant)
      throw new NotFoundException(
        'Tenantul nu exista in registrul de billing.',
      );
    return tenant;
  }

  private async ensureUsageRow(
    db: Knex | Knex.Transaction,
    tenantId: string,
  ): Promise<void> {
    await db('tenant_storage_usage')
      .insert({ tenant_id: tenantId })
      .onConflict('tenant_id')
      .ignore();
  }

  private toState(
    tenant: TenantStorageRow,
    usage: any,
  ): StorageUsageState {
    return buildStorageUsageState(tenant, usage);
  }

  private formatBytes(bytes: bigint): string {
    const mb = Number(bytes) / 1_000_000;
    if (mb < 1_000) return `${mb.toFixed(1)} MB`;
    return `${(mb / 1_000).toFixed(2)} GB`;
  }
}
