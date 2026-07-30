import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantAuditService } from 'src/security/tenant-audit.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { WorkflowCompilerService } from 'src/workflow-engine/workflow-compiler.service';
import { WorkflowHistoryService } from 'src/workflow-engine/workflow-history.service';
import { WorkflowRuntimeService } from 'src/workflow-engine/workflow-runtime.service';
import {
  CreateWorkflowScheduleDto,
  PreviewWorkflowScheduleDto,
  UpdateWorkflowScheduleDto,
} from './dto/workflow-schedule.dto';
import { SchedulerIdentityService } from './scheduler-identity.service';
import { WorkflowScheduleExpressionService } from './workflow-schedule-expression.service';
import type {
  WorkflowScheduleClaim,
  WorkflowScheduleRow,
} from './workflow-schedule.types';

const MAX_ACTIVE_SCHEDULES = 100;
const LEASE_MS = 2 * 60 * 1000;
const LEASE_HEARTBEAT_MS = 30 * 1000;
const MAX_SKIPS_PER_CLAIM = 100;
const ACTIVE_CAPACITY_LOCK = 78025002;

@Injectable()
export class WorkflowScheduleService {
  private readonly logger = new Logger(
    WorkflowScheduleService.name,
  );

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly expressions: WorkflowScheduleExpressionService,
    private readonly identity: SchedulerIdentityService,
    private readonly runtime: WorkflowRuntimeService,
    private readonly history: WorkflowHistoryService,
    private readonly compiler: WorkflowCompilerService,
    private readonly audit: TenantAuditService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async findAll() {
    const schedules = await this.knex(
      'workflow_schedule as schedule',
    )
      .join(
        'workflow_definition as workflow',
        'schedule.id_workflow',
        'workflow.id_workflow',
      )
      .leftJoin(
        'workflow_revision as revision',
        'workflow.active_revision_id',
        'revision.id_revision',
      )
      .select(
        'schedule.*',
        'workflow.name as workflow_name',
        'workflow.status as workflow_status',
        'revision.is_valid as workflow_is_valid',
      )
      .orderBy('schedule.date_created', 'desc');
    const ids = schedules.map(
      (schedule) => schedule.id_schedule,
    );
    const executions = ids.length
      ? await this.knex('workflow_execution')
          .whereIn('id_schedule', ids)
          .distinctOn('id_schedule')
          .select(
            'id_schedule',
            'id_execution',
            'status',
            'error_code',
            'error_message',
            'date_started',
            'date_finished',
            'scheduled_for',
          )
          .orderBy('id_schedule', 'asc')
          .orderBy('date_started', 'desc')
      : [];
    const latest = new Map(
      executions.map((execution) => [
        execution.id_schedule,
        execution,
      ]),
    );
    return {
      data: schedules.map((schedule) =>
        this.present(
          schedule,
          latest.get(schedule.id_schedule) ??
            null,
        ),
      ),
    };
  }

  async findOne(id: string) {
    const schedule = await this.knex(
      'workflow_schedule as schedule',
    )
      .join(
        'workflow_definition as workflow',
        'schedule.id_workflow',
        'workflow.id_workflow',
      )
      .leftJoin(
        'workflow_revision as revision',
        'workflow.active_revision_id',
        'revision.id_revision',
      )
      .where('schedule.id_schedule', id)
      .select(
        'schedule.*',
        'workflow.name as workflow_name',
        'workflow.status as workflow_status',
        'revision.is_valid as workflow_is_valid',
      )
      .first();
    if (!schedule) {
      throw new NotFoundException(
        'Programarea nu a fost gasita.',
      );
    }
    const execution = await this.knex(
      'workflow_execution',
    )
      .where('id_schedule', id)
      .orderBy('date_started', 'desc')
      .first();
    return {
      data: this.present(
        schedule,
        execution ?? null,
      ),
    };
  }

  async create(
    dto: CreateWorkflowScheduleDto,
    actor: AuthenticatedUser,
  ) {
    const isActive = dto.isActive ?? true;
    await this.assertWorkflow(dto.workflowId);
    const timezone = await this.resolveTimezone(
      dto.timezone,
    );
    const definition = this.definition(
      dto.scheduleType,
      dto.cronExpression,
      dto.runAt,
      timezone,
    );
    const nextRunAt = isActive
      ? this.initialNextRun(definition)
      : null;
    const insert = async (
      db: Knex | Knex.Transaction,
    ) => {
      const [created] = await db(
        'workflow_schedule',
      )
        .insert({
          id_workflow: dto.workflowId,
          name: dto.name.trim(),
          ...definition,
          is_active: isActive,
          next_run_at: nextRunAt,
          id_created_by_profile: actor.profileId,
        })
        .returning('*');
      return created;
    };
    const created = isActive
      ? await this.knex.transaction(
          async (trx) => {
            await this.lockActiveCapacity(trx);
            await this.assertActiveCapacity(trx);
            return insert(trx);
          },
        )
      : await insert(this.knex);
    await this.audit.record({
      actorProfileId: actor.profileId,
      action: 'workflow_schedule.created',
      targetType: 'workflow_schedule',
      targetId: created.id_schedule,
      after: this.auditValue(created),
    });
    return this.findOne(created.id_schedule);
  }

  async update(
    id: string,
    dto: UpdateWorkflowScheduleDto,
    actor: AuthenticatedUser,
  ) {
    const existing =
      await this.requireSchedule(id);
    const workflowId =
      dto.workflowId ?? existing.id_workflow;
    if (
      dto.workflowId ||
      (dto.isActive === true &&
        !existing.is_active)
    ) {
      await this.assertWorkflow(workflowId);
    }
    const scheduleType =
      dto.scheduleType ?? existing.schedule_type;
    const timezone = await this.resolveTimezone(
      dto.timezone ?? existing.timezone,
    );
    const cronExpression =
      scheduleType === 'cron'
        ? (dto.cronExpression ??
          (existing.schedule_type === 'cron'
            ? existing.cron_expression
            : undefined))
        : undefined;
    const runAt =
      scheduleType === 'once'
        ? (dto.runAt ??
          (existing.schedule_type === 'once'
            ? new Date(
                existing.run_at as Date | string,
              ).toISOString()
            : undefined))
        : undefined;
    const definition = this.definition(
      scheduleType,
      cronExpression,
      runAt,
      timezone,
    );
    const isActive =
      dto.isActive ?? existing.is_active;
    const isActivation =
      isActive && !existing.is_active;
    const timingChanged =
      dto.scheduleType !== undefined ||
      dto.cronExpression !== undefined ||
      dto.runAt !== undefined ||
      dto.timezone !== undefined;
    let nextRunAt = existing.next_run_at;
    if (!isActive) {
      nextRunAt = null;
    } else if (
      !existing.is_active ||
      timingChanged
    ) {
      nextRunAt = this.initialNextRun(definition);
    }
    const persist = async (
      db: Knex | Knex.Transaction,
    ) => {
      const [updated] = await db(
        'workflow_schedule',
      )
        .where('id_schedule', id)
        .update({
          id_workflow: workflowId,
          name: dto.name?.trim() ?? existing.name,
          ...definition,
          is_active: isActive,
          next_run_at: nextRunAt,
          date_updated: new Date(),
        })
        .returning('*');
      return updated;
    };
    const updated = isActivation
      ? await this.knex.transaction(
          async (trx) => {
            await this.lockActiveCapacity(trx);
            await this.assertActiveCapacity(trx);
            return persist(trx);
          },
        )
      : await persist(this.knex);
    await this.audit.record({
      actorProfileId: actor.profileId,
      action: 'workflow_schedule.updated',
      targetType: 'workflow_schedule',
      targetId: id,
      before: this.auditValue(existing),
      after: this.auditValue(updated),
    });
    return this.findOne(id);
  }

  async activate(
    id: string,
    actor: AuthenticatedUser,
  ) {
    return this.update(
      id,
      { isActive: true },
      actor,
    );
  }

  async deactivate(
    id: string,
    actor: AuthenticatedUser,
  ) {
    return this.update(
      id,
      { isActive: false },
      actor,
    );
  }

  async remove(
    id: string,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.knex.transaction(
      async (trx) => {
        const schedule = (await trx(
          'workflow_schedule',
        )
          .where('id_schedule', id)
          .forUpdate()
          .first()) as
          | WorkflowScheduleRow
          | undefined;
        if (!schedule) {
          throw new NotFoundException(
            'Programarea nu a fost gasita.',
          );
        }
        if (this.hasLiveLease(schedule)) {
          throw new ConflictException(
            'Programarea ruleaza si nu poate fi stearsa.',
          );
        }
        await trx('workflow_schedule')
          .where('id_schedule', id)
          .del();
        return schedule;
      },
    );
    await this.audit.record({
      actorProfileId: actor.profileId,
      action: 'workflow_schedule.deleted',
      targetType: 'workflow_schedule',
      targetId: id,
      before: this.auditValue(existing),
    });
  }

  async preview(dto: PreviewWorkflowScheduleDto) {
    return this.expressions.preview(
      dto.cronExpression,
      dto.timezone,
    );
  }

  async historyList(
    id: string,
    page: number,
    limit: number,
  ) {
    await this.requireSchedule(id);
    return this.history.listBySchedule(
      id,
      page,
      limit,
    );
  }

  async runNow(id: string) {
    const actor = await this.identity.actor();
    const claim = await this.acquireManualLease(
      id,
      actor,
    );
    return this.executeWithLease(claim, () =>
      this.runtime.execute(
        claim.schedule.id_workflow,
        this.executionInput(claim),
      ),
    );
  }

  async claimNextDue(): Promise<WorkflowScheduleClaim | null> {
    const actor = await this.identity.actor();
    for (
      let attempt = 0;
      attempt < MAX_SKIPS_PER_CLAIM;
      attempt += 1
    ) {
      const now = new Date();
      const minuteStart = new Date(
        Math.floor(now.getTime() / 60_000) *
          60_000,
      );
      const result = await this.knex.transaction(
        async (trx) => {
          const schedule = (await trx(
            'workflow_schedule as schedule',
          )
            .join(
              'workflow_definition as workflow',
              'schedule.id_workflow',
              'workflow.id_workflow',
            )
            .where('schedule.is_active', true)
            .where(
              'schedule.next_run_at',
              '<=',
              now,
            )
            .select(
              'schedule.*',
              'workflow.status as workflow_status',
              'workflow.active_revision_id',
              'workflow.latest_revision_id',
            )
            .orderBy(
              'schedule.next_run_at',
              'asc',
            )
            .forUpdate()
            .skipLocked()
            .first()) as
            | WorkflowScheduleRow
            | undefined;
          if (!schedule) return null;
          const scheduledFor = new Date(
            schedule.next_run_at as Date | string,
          );
          const next = this.advance(
            schedule,
            now,
          );
          const basePatch: Record<
            string,
            unknown
          > = {
            ...next,
            date_updated: now,
          };
          if (
            schedule.workflow_status !==
              'active' ||
            !schedule.active_revision_id
          ) {
            await trx('workflow_schedule')
              .where(
                'id_schedule',
                schedule.id_schedule,
              )
              .update({
                ...basePatch,
                is_active: false,
                next_run_at: null,
                lock_token: null,
                locked_until: null,
              });
            return {
              kind: 'skip' as const,
              schedule,
              scheduledFor,
              code: 'workflow_inactive',
              message:
                'Workflow-ul asociat nu mai este activ. Programarea a fost oprita.',
            };
          }
          if (
            scheduledFor.getTime() <
            minuteStart.getTime()
          ) {
            await trx('workflow_schedule')
              .where(
                'id_schedule',
                schedule.id_schedule,
              )
              .update({
                ...basePatch,
                ...(this.hasLiveLease(
                  schedule,
                  now,
                )
                  ? {}
                  : {
                      lock_token: null,
                      locked_until: null,
                    }),
              });
            return {
              kind: 'skip' as const,
              schedule,
              scheduledFor,
              code: 'schedule_missed',
              message:
                'Scadenta a fost omisa deoarece backend-ul nu a procesat-o in minutul programat.',
            };
          }
          if (this.hasLiveLease(schedule, now)) {
            await trx('workflow_schedule')
              .where(
                'id_schedule',
                schedule.id_schedule,
              )
              .update(basePatch);
            return {
              kind: 'skip' as const,
              schedule,
              scheduledFor,
              code: 'schedule_overlap',
              message:
                'Scadenta a fost omisa deoarece programarea avea deja o executie activa.',
            };
          }
          const lockToken = randomUUID();
          await trx('workflow_schedule')
            .where(
              'id_schedule',
              schedule.id_schedule,
            )
            .update({
              ...basePatch,
              lock_token: lockToken,
              locked_until: new Date(
                now.getTime() + LEASE_MS,
              ),
            });
          return {
            kind: 'claim' as const,
            schedule,
            scheduledFor,
            lockToken,
          };
        },
      );
      if (!result) return null;
      if (result.kind === 'skip') {
        await this.recordSkip(
          result.schedule,
          result.scheduledFor,
          actor,
          result.code,
          result.message,
        );
        continue;
      }
      return {
        schedule: result.schedule,
        scheduledFor: result.scheduledFor,
        lockToken: result.lockToken,
        actor,
      };
    }
    return null;
  }

  async executeClaim(
    claim: WorkflowScheduleClaim,
  ): Promise<void> {
    try {
      await this.executeWithLease(claim, () =>
        this.runtime.execute(
          claim.schedule.id_workflow,
          this.executionInput(claim),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Programarea "${claim.schedule.name}" a esuat pentru tenantul ${this.tenantContext.slug}.`,
        error as Error,
      );
    }
  }

  private async assertWorkflow(
    workflowId: string,
  ) {
    const workflow = await this.knex(
      'workflow_definition as workflow',
    )
      .join(
        'workflow_revision as revision',
        'workflow.active_revision_id',
        'revision.id_revision',
      )
      .where('workflow.id_workflow', workflowId)
      .select(
        'workflow.*',
        'revision.source_nodes',
        'revision.source_connections',
        'revision.is_valid',
      )
      .first();
    if (
      !workflow ||
      workflow.status !== 'active' ||
      !workflow.active_revision_id ||
      !workflow.is_valid
    ) {
      throw new BadRequestException(
        'Poate fi programat numai un workflow activ si valid.',
      );
    }
    const validation =
      await this.compiler.compile(
        this.parseArray(workflow.source_nodes),
        this.parseArray(
          workflow.source_connections,
        ),
        {
          workflowId,
          scheduleContext: true,
        },
      );
    if (!validation.valid) {
      throw new BadRequestException(
        validation.errors
          .slice(0, 3)
          .map((error) => error.message)
          .join(' '),
      );
    }
    return workflow;
  }

  private async assertActiveCapacity(
    db: Knex | Knex.Transaction = this.knex,
  ) {
    const row = await db('workflow_schedule')
      .where('is_active', true)
      .count('* as count')
      .first();
    if (
      Number(row?.count ?? 0) >=
      MAX_ACTIVE_SCHEDULES
    ) {
      throw new ConflictException(
        `Pot exista maximum ${MAX_ACTIVE_SCHEDULES} programari active per tenant.`,
      );
    }
  }

  private async lockActiveCapacity(
    trx: Knex.Transaction,
  ) {
    await trx.raw(
      'SELECT pg_advisory_xact_lock(?)',
      [ACTIVE_CAPACITY_LOCK],
    );
  }

  private async resolveTimezone(
    value?: string,
  ): Promise<string> {
    if (value) {
      return this.expressions.validateTimezone(
        value,
      );
    }
    const configuration = await this.knex(
      'tenant_configuration',
    )
      .where('id_configuration', 1)
      .first('timezone');
    return this.expressions.validateTimezone(
      configuration?.timezone ??
        'Europe/Bucharest',
    );
  }

  private definition(
    scheduleType: 'cron' | 'once',
    cronExpression: string | undefined | null,
    runAt: string | undefined,
    timezone: string,
  ) {
    if (scheduleType === 'cron') {
      if (!cronExpression) {
        throw new BadRequestException(
          'Expresia cron este obligatorie.',
        );
      }
      return {
        schedule_type: scheduleType,
        cron_expression:
          this.expressions.normalize(
            cronExpression,
          ),
        run_at: null,
        timezone,
      };
    }
    if (!runAt) {
      throw new BadRequestException(
        'Data rularii este obligatorie.',
      );
    }
    const date = new Date(runAt);
    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() <= Date.now()
    ) {
      throw new BadRequestException(
        'Rularea unica trebuie programata in viitor.',
      );
    }
    return {
      schedule_type: scheduleType,
      cron_expression: null,
      run_at: date,
      timezone,
    };
  }

  private initialNextRun(definition: {
    schedule_type: 'cron' | 'once';
    cron_expression: string | null;
    run_at: Date | null;
    timezone: string;
  }) {
    return definition.schedule_type === 'once'
      ? definition.run_at
      : this.expressions.next(
          definition.cron_expression!,
          definition.timezone,
        );
  }

  private advance(
    schedule: WorkflowScheduleRow,
    now: Date,
  ) {
    if (schedule.schedule_type === 'once') {
      return {
        is_active: false,
        next_run_at: null,
      };
    }
    return {
      is_active: true,
      next_run_at: this.expressions.next(
        schedule.cron_expression!,
        schedule.timezone,
        now,
      ),
    };
  }

  private async acquireManualLease(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<WorkflowScheduleClaim> {
    const now = new Date();
    return this.knex.transaction(async (trx) => {
      const schedule = (await trx(
        'workflow_schedule as schedule',
      )
        .join(
          'workflow_definition as workflow',
          'schedule.id_workflow',
          'workflow.id_workflow',
        )
        .where('schedule.id_schedule', id)
        .select(
          'schedule.*',
          'workflow.status as workflow_status',
          'workflow.active_revision_id',
        )
        .forUpdate()
        .first()) as
        | WorkflowScheduleRow
        | undefined;
      if (!schedule) {
        throw new NotFoundException(
          'Programarea nu a fost gasita.',
        );
      }
      if (
        schedule.workflow_status !== 'active' ||
        !schedule.active_revision_id
      ) {
        throw new BadRequestException(
          'Workflow-ul asociat nu este activ.',
        );
      }
      if (this.hasLiveLease(schedule, now)) {
        throw new ConflictException(
          'Programarea are deja o executie activa.',
        );
      }
      const lockToken = randomUUID();
      await trx('workflow_schedule')
        .where('id_schedule', id)
        .update({
          lock_token: lockToken,
          locked_until: new Date(
            now.getTime() + LEASE_MS,
          ),
        });
      return {
        schedule,
        scheduledFor: now,
        lockToken,
        actor,
      };
    });
  }

  private async recordSkip(
    schedule: WorkflowScheduleRow,
    scheduledFor: Date,
    actor: AuthenticatedUser,
    code: string,
    message: string,
  ) {
    const revisionId =
      schedule.active_revision_id ??
      schedule.latest_revision_id;
    if (!revisionId) {
      this.logger.warn(
        `Nu am putut salva omiterea programarii ${schedule.id_schedule}: workflow fara revizie.`,
      );
      return;
    }
    await this.history.skipExecution(
      schedule.id_workflow,
      revisionId,
      {
        ...this.executionInput({
          schedule,
          scheduledFor,
          lockToken: '',
          actor,
        }),
        actor,
      },
      code,
      message,
    );
  }

  private executionInput(
    claim: WorkflowScheduleClaim,
  ) {
    return {
      trigger: 'schedule' as const,
      triggerName: claim.schedule.name,
      schedule: {
        id: claim.schedule.id_schedule,
        name: claim.schedule.name,
        scheduledFor:
          claim.scheduledFor.toISOString(),
        timezone: claim.schedule.timezone,
      },
      actor: claim.actor,
    };
  }

  private async releaseLease(
    claim: WorkflowScheduleClaim,
  ) {
    await this.knex('workflow_schedule')
      .where({
        id_schedule: claim.schedule.id_schedule,
        lock_token: claim.lockToken,
      })
      .update({
        lock_token: null,
        locked_until: null,
      });
  }

  private async executeWithLease<T>(
    claim: WorkflowScheduleClaim,
    execute: () => Promise<T>,
  ): Promise<T> {
    const heartbeat = setInterval(() => {
      void this.renewLease(claim).catch(
        (error) => {
          this.logger.error(
            `Lease-ul programarii "${claim.schedule.name}" nu a putut fi reinnoit.`,
            error as Error,
          );
        },
      );
    }, LEASE_HEARTBEAT_MS);
    heartbeat.unref();
    try {
      return await execute();
    } finally {
      clearInterval(heartbeat);
      await this.releaseLease(claim);
    }
  }

  private async renewLease(
    claim: WorkflowScheduleClaim,
  ) {
    await this.knex('workflow_schedule')
      .where({
        id_schedule: claim.schedule.id_schedule,
        lock_token: claim.lockToken,
      })
      .update({
        locked_until: new Date(
          Date.now() + LEASE_MS,
        ),
      });
  }

  private hasLiveLease(
    schedule: WorkflowScheduleRow,
    now = new Date(),
  ): boolean {
    return Boolean(
      schedule.locked_until &&
      new Date(schedule.locked_until).getTime() >
        now.getTime(),
    );
  }

  private async requireSchedule(
    id: string,
  ): Promise<WorkflowScheduleRow> {
    const schedule = await this.knex(
      'workflow_schedule',
    )
      .where('id_schedule', id)
      .first();
    if (!schedule) {
      throw new NotFoundException(
        'Programarea nu a fost gasita.',
      );
    }
    return schedule;
  }

  private present(
    schedule: WorkflowScheduleRow,
    lastExecution: Record<string, any> | null,
  ) {
    const onceFinished =
      schedule.schedule_type === 'once' &&
      !schedule.is_active &&
      schedule.run_at &&
      new Date(schedule.run_at).getTime() <=
        Date.now();
    return {
      ...schedule,
      schedule_status: schedule.is_active
        ? 'active'
        : onceFinished
          ? 'completed'
          : 'paused',
      description: this.expressions.describe(
        schedule.schedule_type,
        schedule.cron_expression,
        schedule.run_at,
        schedule.timezone,
      ),
      is_running: this.hasLiveLease(schedule),
      last_execution: lastExecution,
    };
  }

  private auditValue(
    schedule: WorkflowScheduleRow,
  ) {
    return {
      workflowId: schedule.id_workflow,
      name: schedule.name,
      scheduleType: schedule.schedule_type,
      cronExpression: schedule.cron_expression,
      runAt: schedule.run_at,
      timezone: schedule.timezone,
      isActive: schedule.is_active,
    };
  }

  private parseArray(value: unknown): any[] {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}
