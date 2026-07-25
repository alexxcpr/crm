import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MetaDbService } from 'src/tenant/meta-db.service';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';

@Injectable()
export class WorkflowMaintenanceService {
  private readonly logger = new Logger(
    WorkflowMaintenanceService.name,
  );

  constructor(
    private readonly metaDb: MetaDbService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Cron('0 30 3 * * *')
  async cleanupHistory() {
    await this.metaDb.knex.transaction(
      async (trx) => {
        const lock = await trx.raw<{
          rows: Array<{ locked: boolean }>;
        }>(
          'SELECT pg_try_advisory_xact_lock(?) AS locked',
          [78025001],
        );
        if (!lock.rows[0]?.locked) return;
        const tenants = await this.metaDb
          .knex('tenants')
          .where({ is_active: true })
          .select('slug', 'db_name');
        const cutoff = new Date(
          Date.now() - 30 * 24 * 60 * 60 * 1000,
        );
        for (const tenant of tenants) {
          try {
            const db =
              this.connections.getConnection(
                tenant.db_name,
              );
            if (
              !(await db.schema.hasTable(
                'workflow_execution',
              ))
            )
              continue;
            await db('workflow_execution')
              .where('date_started', '<', cutoff)
              .del();
          } catch (error) {
            this.logger.error(
              `Curatarea istoricului workflow a esuat pentru ${tenant.slug}.`,
              error as Error,
            );
          }
        }
      },
    );
  }
}
