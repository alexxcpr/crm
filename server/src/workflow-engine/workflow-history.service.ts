import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type {
  WorkflowExecutionInput,
  WorkflowIrNode,
} from './workflow-engine.types';
import { WorkflowSnapshotService } from './workflow-snapshot.service';

@Injectable()
export class WorkflowHistoryService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly snapshots: WorkflowSnapshotService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async startExecution(
    workflowId: string,
    revisionId: string,
    input: WorkflowExecutionInput,
  ): Promise<string> {
    const executionId = randomUUID();
    await this.knex('workflow_execution').insert({
      id_execution: executionId,
      id_workflow: workflowId,
      id_revision: revisionId,
      parent_execution_id:
        input.parentExecutionId ?? null,
      trigger_type: input.trigger,
      trigger_name: input.triggerName ?? null,
      id_schedule: input.schedule?.id ?? null,
      scheduled_for:
        input.schedule?.scheduledFor ?? null,
      entity_slug: input.entitySlug ?? null,
      record_id: input.recordId ?? null,
      id_actor_user: input.actor.id,
      id_actor_profile: input.actor.profileId,
      status: 'running',
    });
    return executionId;
  }

  async completeExecution(
    executionId: string,
    startedAt: number,
  ) {
    await this.knex('workflow_execution')
      .where('id_execution', executionId)
      .update({
        status: 'completed',
        duration_ms: Date.now() - startedAt,
        date_finished: new Date(),
      });
  }

  async failExecution(
    executionId: string,
    startedAt: number,
    error: unknown,
  ) {
    await this.knex('workflow_execution')
      .where('id_execution', executionId)
      .update({
        status: 'failed',
        error_code: this.errorCode(error),
        error_message: this.errorMessage(
          error,
        ).slice(0, 10_000),
        duration_ms: Date.now() - startedAt,
        date_finished: new Date(),
      });
  }

  async skipExecution(
    workflowId: string,
    revisionId: string,
    input: WorkflowExecutionInput,
    code: string,
    message: string,
  ): Promise<string> {
    const executionId = randomUUID();
    await this.knex('workflow_execution').insert({
      id_execution: executionId,
      id_workflow: workflowId,
      id_revision: revisionId,
      trigger_type: input.trigger,
      trigger_name: input.triggerName ?? null,
      id_schedule: input.schedule?.id ?? null,
      scheduled_for:
        input.schedule?.scheduledFor ?? null,
      entity_slug: input.entitySlug ?? null,
      record_id: input.recordId ?? null,
      id_actor_user: input.actor.id,
      id_actor_profile: input.actor.profileId,
      status: 'skipped',
      error_code: code.slice(0, 100),
      error_message: message.slice(0, 10_000),
      duration_ms: 0,
      date_finished: new Date(),
    });
    return executionId;
  }

  async startNodeRun(input: {
    executionId: string;
    node: WorkflowIrNode;
    runIndex: number;
    itemIndex: number;
    value: unknown;
  }): Promise<string> {
    const id = randomUUID();
    await this.knex('workflow_node_run').insert({
      id_node_run: id,
      id_execution: input.executionId,
      node_id: input.node.id,
      node_type: input.node.type,
      run_index: input.runIndex,
      item_index: input.itemIndex,
      status: 'running',
      input_snapshot: JSON.stringify(
        this.snapshots.sanitize(input.value),
      ),
    });
    return id;
  }

  async completeNodeRun(
    id: string,
    startedAt: number,
    output: unknown,
  ) {
    await this.knex('workflow_node_run')
      .where('id_node_run', id)
      .update({
        status: 'completed',
        output_snapshot: JSON.stringify(
          this.snapshots.sanitize(output),
        ),
        duration_ms: Date.now() - startedAt,
        date_finished: new Date(),
      });
  }

  async failNodeRun(
    id: string,
    startedAt: number,
    error: unknown,
  ) {
    await this.knex('workflow_node_run')
      .where('id_node_run', id)
      .update({
        status: 'failed',
        error_code: this.errorCode(error),
        error_message: this.errorMessage(
          error,
        ).slice(0, 10_000),
        duration_ms: Date.now() - startedAt,
        date_finished: new Date(),
      });
  }

  async list(
    workflowId: string,
    page = 1,
    limit = 25,
  ) {
    return this.listFiltered(
      { workflowId },
      page,
      limit,
    );
  }

  async listBySchedule(
    scheduleId: string,
    page = 1,
    limit = 25,
  ) {
    return this.listFiltered(
      { scheduleId },
      page,
      limit,
    );
  }

  private async listFiltered(
    filter: {
      workflowId?: string;
      scheduleId?: string;
    },
    page: number,
    limit: number,
  ) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(
      100,
      Math.max(1, limit),
    );
    const base = this.knex('workflow_execution');
    if (filter.workflowId) {
      base.where(
        'workflow_execution.id_workflow',
        filter.workflowId,
      );
    }
    if (filter.scheduleId) {
      base.where(
        'workflow_execution.id_schedule',
        filter.scheduleId,
      );
    }
    const [countRow, data] = await Promise.all([
      base.clone().count('* as total').first(),
      base
        .clone()
        .leftJoin(
          'profile',
          'workflow_execution.id_actor_profile',
          'profile.id_profile',
        )
        .select(
          'workflow_execution.*',
          'profile.display_name as actor_display_name',
          'profile.username as actor_username',
        )
        .orderBy(
          'workflow_execution.date_started',
          'desc',
        )
        .limit(safeLimit)
        .offset((safePage - 1) * safeLimit),
    ]);
    const total = Number(countRow?.total ?? 0);
    return {
      data,
      meta: {
        total,
        page: safePage,
        limit: safeLimit,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  async detail(
    workflowId: string,
    executionId: string,
  ) {
    const execution = await this.knex(
      'workflow_execution',
    )
      .where({
        id_execution: executionId,
        id_workflow: workflowId,
      })
      .first();
    if (!execution) {
      throw new NotFoundException(
        'Executia workflow nu a fost gasita.',
      );
    }
    const nodeRuns = await this.knex(
      'workflow_node_run',
    )
      .where('id_execution', executionId)
      .orderBy('date_started', 'asc');
    return { ...execution, nodeRuns };
  }

  private errorCode(error: unknown): string {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      typeof (error as any).code === 'string'
    ) {
      return (error as any).code.slice(0, 100);
    }
    return (
      (error as any)?.constructor?.name?.slice(
        0,
        100,
      ) ?? 'Error'
    );
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error)
      return error.message;
    if (typeof error === 'string') return error;
    return 'Eroare necunoscuta';
  }
}
