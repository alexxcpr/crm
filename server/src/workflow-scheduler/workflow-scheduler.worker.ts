import {
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  Cron,
  CronExpression,
} from '@nestjs/schedule';
import { MetaDbService } from 'src/tenant/meta-db.service';
import { TenantConnectionManager } from 'src/tenant/tenant-connection.manager';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { WorkflowScheduleService } from './workflow-schedule.service';

const MAX_CONCURRENT_EXECUTIONS = 5;

interface TenantRow {
  slug: string;
  db_name: string;
}

@Injectable()
export class WorkflowSchedulerWorker {
  private readonly logger = new Logger(
    WorkflowSchedulerWorker.name,
  );
  private running = false;

  constructor(
    private readonly metaDb: MetaDbService,
    private readonly connections: TenantConnectionManager,
    private readonly tenantContext: TenantContext,
    private readonly schedules: WorkflowScheduleService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const tenants = (await this.metaDb
        .knex('tenants')
        .where({
          is_active: true,
          provisioning_status: 'provisioned',
        })
        .select(
          'slug',
          'db_name',
        )) as TenantRow[];
      if (!tenants.length) return;
      let cursor = 0;
      const process = async () => {
        let emptyTenants = 0;
        while (emptyTenants < tenants.length) {
          const tenant =
            tenants[cursor++ % tenants.length];
          const knex =
            this.connections.getConnection(
              tenant.db_name,
            );
          try {
            const claim =
              await this.tenantContext.run(
                {
                  knex,
                  slug: tenant.slug,
                  dbName: tenant.db_name,
                },
                () =>
                  this.schedules.claimNextDue(),
              );
            if (!claim) {
              emptyTenants += 1;
              continue;
            }
            emptyTenants = 0;
            await this.tenantContext.run(
              {
                knex,
                slug: tenant.slug,
                dbName: tenant.db_name,
              },
              () =>
                this.schedules.executeClaim(
                  claim,
                ),
            );
          } catch (error) {
            emptyTenants += 1;
            this.logger.error(
              `Procesarea programarilor a esuat pentru tenantul ${tenant.slug}.`,
              error as Error,
            );
          }
        }
      };
      await Promise.all(
        Array.from(
          {
            length: Math.min(
              MAX_CONCURRENT_EXECUTIONS,
              Math.max(1, tenants.length * 5),
            ),
          },
          () => process(),
        ),
      );
    } catch (error) {
      this.logger.error(
        'Worker-ul de programari a esuat.',
        error as Error,
      );
    } finally {
      this.running = false;
    }
  }
}
