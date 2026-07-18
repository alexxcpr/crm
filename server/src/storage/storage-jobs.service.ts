import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Cron,
  CronExpression,
} from '@nestjs/schedule';
import { MetaDbService } from 'src/tenant/meta-db.service';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';
import { STORAGE_PROVIDER } from './storage.constants';
import { StorageQuotaService } from './storage-quota.service';
import type { StorageProvider } from './storage.types';

interface JobTenant {
  id: string;
  slug: string;
  db_name: string;
  db_user: string | null;
  db_password_encrypted: string | null;
}

@Injectable()
export class StorageJobsService {
  private readonly logger = new Logger(
    StorageJobsService.name,
  );

  constructor(
    private readonly config: ConfigService,
    private readonly metaDb: MetaDbService,
    private readonly connections: TenantConnectionManager,
    private readonly quota: StorageQuotaService,
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupAndRetry(): Promise<void> {
    if (!this.enabled) return;
    await this.withLock(78017001, async () => {
      await this.expireReservations();
      await this.recoverCompletedFiles();
      await this.markAbandonedFiles();
      await this.retryDeletions();
    });
  }

  private async recoverCompletedFiles(): Promise<void> {
    for (const tenant of await this.tenants()) {
      try {
        const db = this.connection(tenant);
        const files = await db('stored_file')
          .whereIn('status', [
            'pending',
            'scanning',
          ])
          .select('id_file')
          .limit(100);
        if (!files.length) continue;

        const reservations = await this.metaDb
          .knex('tenant_storage_reservation')
          .where({
            tenant_id: tenant.id,
            status: 'completed',
          })
          .whereIn(
            'file_id',
            files.map((file) => file.id_file),
          );
        for (const reservation of reservations) {
          const object =
            await this.provider.headObject(
              this.bucket,
              reservation.final_object_key,
            );
          if (
            !object ||
            object.contentLength !==
              Number(reservation.expected_bytes)
          ) {
            this.logger.error(
              `Recuperare finalizare: obiect final invalid pentru file=${reservation.file_id}`,
            );
            continue;
          }
          await db('stored_file')
            .where({
              id_file: reservation.file_id,
            })
            .update({
              status: 'active',
              etag: object.etag,
              date_updated: db.fn.now(),
            });
          await this.provider
            .deleteObject(
              this.bucket,
              reservation.temporary_object_key,
            )
            .catch(() => undefined);
        }
      } catch (error) {
        this.logger.error(
          `Recuperarea confirmarilor a esuat pentru ${tenant.slug}.`,
          error as Error,
        );
      }
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async reconcile(): Promise<void> {
    if (!this.enabled) return;
    await this.withLock(78017002, async () => {
      await this.quota.recalculateAllCounters();
      const rows = await this.metaDb
        .knex('tenant_storage_reservation')
        .where({ status: 'completed' })
        .select(
          'tenant_id',
          'file_id',
          'final_object_key',
        );
      for (const row of rows) {
        try {
          if (
            !(await this.provider.headObject(
              this.bucket,
              row.final_object_key,
            ))
          ) {
            this.logger.error(
              `Reconciliere: obiect lipsa pentru tenant=${row.tenant_id}, file=${row.file_id}`,
            );
          }
        } catch (error) {
          this.logger.error(
            `Reconciliere S3 esuata pentru file=${row.file_id}`,
            error as Error,
          );
        }
      }
      await this.detectOrphanObjects();
    });
  }

  private async detectOrphanObjects(): Promise<void> {
    const maxObjects = this.numberConfig(
      'STORAGE_RECONCILE_MAX_OBJECTS',
      10_000,
    );
    for (const tenant of await this.tenants()) {
      try {
        let continuationToken: string | undefined;
        let inspected = 0;
        do {
          const page =
            await this.provider.listObjectsPage({
              bucket: this.bucket,
              prefix: `tenants/${tenant.id}/files/`,
              continuationToken,
              maxKeys: Math.min(
                500,
                maxObjects - inspected,
              ),
            });
          const keys = page.objects.map(
            (object) => object.objectKey,
          );
          if (keys.length) {
            const known = await this.metaDb
              .knex('tenant_storage_reservation')
              .where({ tenant_id: tenant.id })
              .whereIn('final_object_key', keys)
              .pluck('final_object_key');
            const knownKeys = new Set(
              known.map(String),
            );
            for (const object of page.objects) {
              if (
                !knownKeys.has(object.objectKey)
              ) {
                this.logger.error(
                  `Reconciliere: obiect orfan pentru tenant=${tenant.id}, key=${object.objectKey}`,
                );
              }
            }
          }
          inspected += page.objects.length;
          continuationToken =
            page.nextContinuationToken;
        } while (
          continuationToken &&
          inspected < maxObjects
        );

        if (continuationToken) {
          this.logger.warn(
            `Reconcilierea tenantului ${tenant.slug} a atins limita de ${maxObjects} obiecte.`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Detectarea obiectelor orfane a esuat pentru ${tenant.slug}.`,
          error as Error,
        );
      }
    }
  }

  private async expireReservations(): Promise<void> {
    const rows = await this.metaDb
      .knex(
        'tenant_storage_reservation as reservation',
      )
      .join(
        'tenants as tenant',
        'tenant.id',
        'reservation.tenant_id',
      )
      .whereIn('reservation.status', [
        'pending',
        'finalizing',
      ])
      .where(
        'reservation.expires_at',
        '<=',
        this.metaDb.knex.fn.now(),
      )
      .select(
        'reservation.*',
        'tenant.slug',
        'tenant.db_name',
        'tenant.db_user',
        'tenant.db_password_encrypted',
      )
      .limit(100);

    for (const row of rows) {
      try {
        await Promise.allSettled([
          this.provider.deleteObject(
            this.bucket,
            row.temporary_object_key,
          ),
          this.provider.deleteObject(
            this.bucket,
            row.final_object_key,
          ),
        ]);
        await this.quota.releaseReserved(
          row.tenant_id,
          row.file_id,
          'expired',
          'UPLOAD_EXPIRED',
        );
        const tenantDb = this.connection(row);
        await tenantDb('stored_file')
          .where({ id_file: row.file_id })
          .whereIn('status', [
            'pending',
            'scanning',
          ])
          .update({
            status: 'failed',
            date_updated: tenantDb.fn.now(),
          });
      } catch (error) {
        this.logger.error(
          `Cleanup upload expirat esuat pentru ${row.file_id}`,
          error as Error,
        );
      }
    }
  }

  private async markAbandonedFiles(): Promise<void> {
    const cutoffSeconds = this.numberConfig(
      'STORAGE_UNBOUND_FILE_TTL_SECONDS',
      86_400,
    );
    const cutoff = new Date(
      Date.now() - cutoffSeconds * 1_000,
    );
    for (const tenant of await this.tenants()) {
      try {
        const db = this.connection(tenant);
        await db('stored_file')
          .where({ status: 'active' })
          .whereNull('record_id')
          .where('date_updated', '<=', cutoff)
          .update({
            status: 'deleting',
            date_updated: db.fn.now(),
          });
      } catch (error) {
        this.logger.error(
          `Marcarea fisierelor abandonate a esuat pentru ${tenant.slug}`,
          error as Error,
        );
      }
    }
  }

  private async retryDeletions(): Promise<void> {
    for (const tenant of await this.tenants()) {
      const db = this.connection(tenant);
      let files: any[] = [];
      try {
        files = await db('stored_file')
          .where({ status: 'deleting' })
          .select('*')
          .limit(100);
      } catch (error) {
        this.logger.error(
          `Citirea fisierelor de sters a esuat pentru ${tenant.slug}`,
          error as Error,
        );
        continue;
      }

      for (const file of files) {
        try {
          await this.provider.deleteObject(
            file.bucket,
            file.object_key,
          );
          if (
            await this.provider.headObject(
              file.bucket,
              file.object_key,
            )
          )
            continue;
          await this.quota.deleteCompletedForTenant(
            tenant.id,
            file.id_file,
          );
          await db('stored_file')
            .where({ id_file: file.id_file })
            .update({
              status: 'deleted',
              date_deleted: db.fn.now(),
              date_updated: db.fn.now(),
            });
        } catch (error) {
          this.logger.error(
            `Retry stergere esuat pentru ${file.id_file}`,
            error as Error,
          );
        }
      }
    }
  }

  private async tenants(): Promise<JobTenant[]> {
    return this.metaDb
      .knex('tenants')
      .where({ is_active: true })
      .select(
        'id',
        'slug',
        'db_name',
        'db_user',
        'db_password_encrypted',
      ) as Promise<JobTenant[]>;
  }

  private connection(
    tenant: Pick<
      JobTenant,
      | 'db_name'
      | 'db_user'
      | 'db_password_encrypted'
    >,
  ) {
    return this.connections.getConnection({
      dbName: tenant.db_name,
      dbUser: tenant.db_user,
      dbPassword: tenant.db_password_encrypted,
    });
  }

  private async withLock(
    lockId: number,
    callback: () => Promise<void>,
  ): Promise<void> {
    await this.metaDb.knex.transaction(
      async (trx) => {
        const result = await trx.raw<{
          rows: Array<{ locked: boolean }>;
        }>(
          'SELECT pg_try_advisory_xact_lock(?) AS locked',
          [lockId],
        );
        if (!result.rows[0]?.locked) return;
        await callback();
      },
    );
  }

  private numberConfig(
    key: string,
    fallback: number,
  ): number {
    const value = Number(
      this.config.get<string>(
        key,
        String(fallback),
      ),
    );
    return Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  private get enabled() {
    return (
      this.config.get<string>(
        'STORAGE_ENABLED',
        'false',
      ) === 'true'
    );
  }

  private get bucket() {
    return this.config.get<string>(
      'STORAGE_S3_BUCKET',
      '',
    );
  }
}
