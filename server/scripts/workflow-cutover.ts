import 'dotenv/config';
import knex, { type Knex } from 'knex';
import {
  MigrationExtension,
  migrationDirectory,
} from '../src/tenant/migration-directory';
import { NodeRegistryService } from '../src/workflow-engine/node-registry.service';
import { WorkflowCompilerService } from '../src/workflow-engine/workflow-compiler.service';
import { WorkflowHttpDomainService } from '../src/workflow-engine/http-domain.service';
import { TenantContext } from '../src/tenant/tenant-context.service';

interface TenantRow {
  slug: string;
  db_name: string;
}

interface WorkflowReport {
  tenant: string;
  workflowId: string;
  workflow: string;
  status: 'compatible' | 'incompatible';
  reasons: string[];
}

function connection(database: string): Knex {
  return knex({
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database,
    },
    pool: { min: 0, max: 1 },
  });
}

function array(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function inspectTenant(
  tenant: TenantRow,
): Promise<WorkflowReport[]> {
  const db = connection(tenant.db_name);
  try {
    const hasLegacyNodes =
      await db.schema.hasColumn(
        'workflow_definition',
        'nodes',
      );
    const workflows = await db(
      'workflow_definition',
    ).select('*');
    const hasDomainTable =
      await db.schema.hasTable(
        'workflow_http_allowed_domain',
      );
    const allowedDomains = hasDomainTable
      ? await db(
          'workflow_http_allowed_domain',
        ).where('is_active', true)
      : [];
    const allowed = new Set(
      allowedDomains.map(
        (domain) =>
          `${domain.hostname}:${domain.port ?? 'default'}`,
      ),
    );
    const tenantContext = new TenantContext();
    const compiler = new WorkflowCompilerService(
      tenantContext,
      new NodeRegistryService(),
      {
        findAllowed: async (url: URL) => {
          const port = url.port
            ? Number(url.port)
            : url.protocol === 'https:'
              ? 443
              : 80;
          const hostname =
            url.hostname.toLowerCase();
          return url.port
            ? allowed.has(`${hostname}:${port}`)
            : allowed.has(
                `${hostname}:default`,
              ) ||
                allowed.has(
                  `${hostname}:${port}`,
                );
        },
      } as any,
    );
    const reports: WorkflowReport[] = [];

    for (const workflow of workflows) {
      let nodes: any[];
      let connections: any[];
      if (hasLegacyNodes) {
        nodes = array(workflow.nodes);
        connections = array(workflow.connections);
      } else {
        const revision =
          workflow.latest_revision_id
            ? await db('workflow_revision')
                .where(
                  'id_revision',
                  workflow.latest_revision_id,
                )
                .first()
            : null;
        nodes = array(revision?.source_nodes);
        connections = array(
          revision?.source_connections,
        );
      }
      const reasons = new Set<string>();
      const actions = await db(
        'action_definition',
      )
        .where({
          id_workflow: workflow.id_workflow,
          is_active: true,
        })
        .select('trigger_events');
      const triggerEvents = actions.flatMap(
        (action) =>
          array(action.trigger_events).map(
            String,
          ),
      );
      const compilation = await tenantContext.run(
        {
          knex: db,
          slug: tenant.slug,
          dbName: tenant.db_name,
        },
        () =>
          compiler.compile(nodes, connections, {
            triggerEvents,
          }),
      );
      for (const error of compilation.errors) {
        if (error.code === 'unsupported_delay') {
          reasons.add('contine Delay');
        } else if (
          error.code === 'unsupported_code'
        ) {
          reasons.add('contine Cod Custom');
        } else if (
          error.code === 'http_domain_not_allowed'
        ) {
          reasons.add('HTTP domain neaprobat');
        } else {
          reasons.add(
            'configuratie/referinta invalida',
          );
        }
      }
      reports.push({
        tenant: tenant.slug,
        workflowId: workflow.id_workflow,
        workflow: workflow.name,
        status: reasons.size
          ? 'incompatible'
          : 'compatible',
        reasons: [...reasons],
      });
    }
    return reports;
  } finally {
    await db.destroy();
  }
}

async function migrationExtension(
  tenantDb: Knex,
): Promise<MigrationExtension | undefined> {
  if (
    !(await tenantDb.schema.hasTable(
      'knex_migrations',
    ))
  )
    return undefined;
  const latest = await tenantDb('knex_migrations')
    .select('name')
    .orderBy('id', 'desc')
    .first();
  if (latest?.name?.endsWith('.ts')) return 'ts';
  if (latest?.name?.endsWith('.js')) return 'js';
  return undefined;
}

async function verifyCutover(
  db: Knex,
  tenant: TenantRow,
) {
  for (const column of [
    'nodes',
    'connections',
    'n8n_workflow_id',
  ]) {
    if (
      await db.schema.hasColumn(
        'workflow_definition',
        column,
      )
    ) {
      throw new Error(
        `Verificarea cutover a esuat pentru ${tenant.slug}: coloana legacy ${column} exista inca.`,
      );
    }
  }
  const definitions = await db(
    'workflow_definition',
  )
    .count('* as total')
    .first();
  const revised = await db('workflow_revision')
    .countDistinct({ total: 'id_workflow' })
    .first();
  if (
    Number(definitions?.total ?? 0) !==
    Number(revised?.total ?? 0)
  ) {
    throw new Error(
      `Verificarea cutover a esuat pentru ${tenant.slug}: numarul definitiilor nu coincide cu workflow-urile revizuite.`,
    );
  }
  const invalidActive = await db(
    'workflow_definition as workflow',
  )
    .leftJoin(
      'workflow_revision as revision',
      'workflow.active_revision_id',
      'revision.id_revision',
    )
    .where('workflow.status', 'active')
    .andWhere((builder) =>
      builder
        .whereNull('workflow.active_revision_id')
        .orWhere('revision.is_valid', false),
    )
    .first('workflow.id_workflow');
  if (invalidActive) {
    throw new Error(
      `Verificarea cutover a esuat pentru ${tenant.slug}: exista un workflow activ fara revizie valida.`,
    );
  }
}

async function compileMigratedRevisions(
  db: Knex,
  tenant: TenantRow,
  originallyActive: Set<string>,
) {
  const context = new TenantContext();
  const compiler = new WorkflowCompilerService(
    context,
    new NodeRegistryService(),
    new WorkflowHttpDomainService(context),
  );
  const workflows = await db(
    'workflow_definition',
  ).select(
    'id_workflow',
    'latest_revision_id',
    'status',
  );
  for (const workflow of workflows) {
    if (!workflow.latest_revision_id) continue;
    const revision = await db('workflow_revision')
      .where(
        'id_revision',
        workflow.latest_revision_id,
      )
      .first();
    if (!revision) continue;
    const actions = await db('action_definition')
      .where({
        id_workflow: workflow.id_workflow,
        is_active: true,
      })
      .select('trigger_events');
    const triggerEvents = actions.flatMap(
      (action) =>
        array(action.trigger_events).map(String),
    );
    const sourceNodes = array(
      revision.source_nodes,
    );
    const compilation = await context.run(
      {
        knex: db,
        slug: tenant.slug,
        dbName: tenant.db_name,
      },
      () =>
        compiler.compile(
          sourceNodes,
          array(revision.source_connections),
          { triggerEvents },
        ),
    );
    await db.transaction(async (trx) => {
      await trx('workflow_revision')
        .where(
          'id_revision',
          revision.id_revision,
        )
        .update({
          source_nodes:
            JSON.stringify(sourceNodes),
          compiled_ir: compilation.ir
            ? JSON.stringify(compilation.ir)
            : null,
          is_valid: compilation.valid,
          validation_errors: JSON.stringify(
            compilation.errors,
          ),
        });
      if (
        originallyActive.has(
          workflow.id_workflow,
        ) &&
        compilation.valid
      ) {
        await trx('workflow_definition')
          .where(
            'id_workflow',
            workflow.id_workflow,
          )
          .update({
            status: 'active',
            active_revision_id:
              revision.id_revision,
          });
      } else if (
        originallyActive.has(workflow.id_workflow)
      ) {
        await trx('workflow_definition')
          .where(
            'id_workflow',
            workflow.id_workflow,
          )
          .update({
            status: 'paused',
            active_revision_id: null,
          });
      }
    });
  }
}

async function main() {
  const mode = process.argv[2] ?? 'preflight';
  if (!['preflight', 'cutover'].includes(mode)) {
    throw new Error(
      'Foloseste: workflow-cutover preflight|cutover',
    );
  }
  const meta = connection(
    process.env.META_DB || 'meta',
  );
  const tenants = await meta<TenantRow>('tenants')
    .select('slug', 'db_name')
    .where('is_active', true)
    .orderBy('slug');
  await meta.destroy();
  const report = (
    await Promise.all(
      tenants.map((tenant) =>
        inspectTenant(tenant),
      ),
    )
  ).flat();
  console.log(JSON.stringify(report, null, 2));
  const invalid = report.filter(
    (item) => item.status === 'incompatible',
  );
  console.log(
    `Preflight: ${report.length - invalid.length} compatibile, ${invalid.length} incompatibile.`,
  );
  if (mode === 'preflight') return;

  if (
    process.env.CUTOVER_BACKUP_CONFIRMED !==
      'true' ||
    process.env.CUTOVER_TRAFFIC_STOPPED !== 'true'
  ) {
    throw new Error(
      'Cutover refuzat: confirma backup-ul si oprirea traficului prin CUTOVER_BACKUP_CONFIRMED=true si CUTOVER_TRAFFIC_STOPPED=true.',
    );
  }
  if (
    invalid.length &&
    !process.argv.includes('--accept-invalid')
  ) {
    throw new Error(
      'Exista workflow-uri incompatibile. Verifica raportul si foloseste --accept-invalid pentru a le migra dezactivate.',
    );
  }

  for (const tenant of tenants) {
    const db = connection(tenant.db_name);
    try {
      const originallyActive = new Set<string>(
        await db('workflow_definition')
          .where('status', 'active')
          .pluck('id_workflow'),
      );
      const extension =
        await migrationExtension(db);
      await db.migrate.latest(
        migrationDirectory('tenant', extension),
      );
      await compileMigratedRevisions(
        db,
        tenant,
        originallyActive,
      );
      await verifyCutover(db, tenant);
      console.log(
        `CUTOVER OK ${tenant.slug} (${tenant.db_name})`,
      );
    } finally {
      await db.destroy();
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
