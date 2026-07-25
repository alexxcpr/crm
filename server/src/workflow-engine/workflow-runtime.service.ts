import {
  BadRequestException,
  Injectable,
  RequestTimeoutException,
} from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { WorkflowCallContextService } from './workflow-call-context.service';
import type {
  WorkflowExecutionContext,
  WorkflowExecutionInput,
  WorkflowExecutionToken,
  WorkflowIrEdge,
  WorkflowIrNode,
  WorkflowIrV1,
  WorkflowRuntimeResult,
} from './workflow-engine.types';
import { WorkflowHistoryService } from './workflow-history.service';
import { WorkflowNodeExecutorService } from './workflow-node-executor.service';

const WORKFLOW_DEADLINE_MS = 60_000;
const MAX_NODE_RUNS = 1_000;
const MAX_FOREACH_ITEMS = 500;
const MAX_NESTED_DEPTH = 10;

@Injectable()
export class WorkflowRuntimeService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly history: WorkflowHistoryService,
    private readonly executor: WorkflowNodeExecutorService,
    private readonly calls: WorkflowCallContextService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async execute(
    workflowId: string,
    input: WorkflowExecutionInput,
  ): Promise<WorkflowRuntimeResult> {
    const workflow = await this.knex(
      'workflow_definition',
    )
      .where('id_workflow', workflowId)
      .first();
    if (
      !workflow ||
      workflow.status !== 'active'
    ) {
      throw new BadRequestException(
        'Workflow-ul nu exista sau nu este activ.',
      );
    }
    if (!workflow.active_revision_id) {
      throw new BadRequestException(
        'Workflow-ul nu are o revizie activa valida.',
      );
    }
    const revision = await this.knex(
      'workflow_revision',
    )
      .where({
        id_revision: workflow.active_revision_id,
        id_workflow: workflowId,
        is_valid: true,
      })
      .first();
    if (!revision) {
      throw new BadRequestException(
        'Revizia activa a workflow-ului nu este valida.',
      );
    }
    const ir = this.parseIr(revision.compiled_ir);
    const currentCall = this.calls.current;
    const depth =
      input.depth ??
      (currentCall?.depth ?? -1) + 1;
    if (depth >= MAX_NESTED_DEPTH) {
      throw new BadRequestException(
        `Workflow-ul a depasit limita de ${MAX_NESTED_DEPTH} executii imbricate.`,
      );
    }
    const normalizedInput: WorkflowExecutionInput =
      {
        ...input,
        parentExecutionId:
          input.parentExecutionId ??
          currentCall?.executionId ??
          null,
        depth,
      };
    const startedAt = Date.now();
    const abortController = new AbortController();
    const deadlineTimer = setTimeout(
      () => abortController.abort(),
      WORKFLOW_DEADLINE_MS,
    );
    deadlineTimer.unref();
    let executionId: string;
    try {
      executionId =
        await this.history.startExecution(
          workflowId,
          revision.id_revision,
          normalizedInput,
        );
    } catch (error) {
      clearTimeout(deadlineTimer);
      throw error;
    }
    const context: WorkflowExecutionContext = {
      ...normalizedInput,
      executionId,
      workflowId,
      revisionId: revision.id_revision,
      deadlineAt:
        startedAt + WORKFLOW_DEADLINE_MS,
      signal: abortController.signal,
      nodeRunCount: 0,
      outputs: new Map(),
    };

    return this.calls.run(
      { executionId, depth },
      async () => {
        try {
          const output = await this.runIr(
            ir,
            context,
          );
          await this.history.completeExecution(
            executionId,
            startedAt,
          );
          return {
            executionId,
            status: 'completed',
            output,
          };
        } catch (error) {
          await this.history.failExecution(
            executionId,
            startedAt,
            error,
          );
          if (
            error &&
            typeof error === 'object'
          ) {
            (error as any).executionId =
              executionId;
            (error as any).workflowStatus =
              'failed';
          }
          throw error;
        } finally {
          clearTimeout(deadlineTimer);
        }
      },
    );
  }

  private async runIr(
    ir: WorkflowIrV1,
    context: WorkflowExecutionContext,
  ): Promise<Record<string, any>> {
    const nodes = new Map(
      ir.nodes.map((node) => [node.id, node]),
    );
    const edgesBySource = new Map<
      string,
      WorkflowIrEdge[]
    >();
    for (const edge of ir.edges) {
      const list =
        edgesBySource.get(edge.source) ?? [];
      list.push(edge);
      list.sort(
        (left, right) => left.order - right.order,
      );
      edgesBySource.set(edge.source, list);
    }
    const runIndexes = new Map<string, number>();
    const leaves: any[] = [];
    const start = nodes.get(ir.startNodeId);
    if (!start) {
      throw new BadRequestException(
        'IR-ul nu contine nodul START.',
      );
    }

    const visit = async (
      node: WorkflowIrNode,
      token: WorkflowExecutionToken,
    ): Promise<void> => {
      this.assertCanRun(context);
      const key = `${node.id}:${token.itemIndex}`;
      const runIndex = runIndexes.get(key) ?? 0;
      runIndexes.set(key, runIndex + 1);
      context.nodeRunCount += 1;
      const nodeStartedAt = Date.now();
      const nodeRunId =
        await this.history.startNodeRun({
          executionId: context.executionId,
          node,
          runIndex,
          itemIndex: token.itemIndex,
          value: token.current,
        });
      let output: any;
      try {
        output = await this.executor.execute({
          context,
          node,
          token,
          runIndex,
        });
        await this.history.completeNodeRun(
          nodeRunId,
          nodeStartedAt,
          output,
        );
        this.assertCanRun(context);
      } catch (error) {
        await this.history.failNodeRun(
          nodeRunId,
          nodeStartedAt,
          error,
        );
        throw error;
      }

      const nodeOutputs =
        context.outputs.get(node.id) ?? [];
      nodeOutputs.push({
        nodeId: node.id,
        runIndex,
        itemIndex: token.itemIndex,
        value: output,
      });
      context.outputs.set(node.id, nodeOutputs);

      let outgoing =
        edgesBySource.get(node.id) ?? [];
      if (node.type === 'condition') {
        outgoing = outgoing.filter(
          (edge) =>
            edge.sourceHandle ===
            (output?.matched ? 'true' : 'false'),
        );
      }
      if (node.type === 'for_each') {
        const items = Array.isArray(output)
          ? output
          : [];
        if (items.length > MAX_FOREACH_ITEMS) {
          throw new BadRequestException(
            `Pentru Fiecare permite maximum ${MAX_FOREACH_ITEMS} elemente.`,
          );
        }
        if (!outgoing.length) {
          leaves.push(items);
          return;
        }
        for (
          let itemIndex = 0;
          itemIndex < items.length;
          itemIndex += 1
        ) {
          nodeOutputs.push({
            nodeId: node.id,
            runIndex,
            itemIndex,
            value: items[itemIndex],
          });
          context.outputs.set(
            node.id,
            nodeOutputs,
          );
          for (const edge of outgoing) {
            await visit(nodes.get(edge.target)!, {
              itemIndex,
              current: this.asRecord(
                items[itemIndex],
              ),
              sourceNodeId: node.id,
            });
          }
        }
        return;
      }
      if (!outgoing.length) {
        leaves.push(output);
        return;
      }
      for (const edge of outgoing) {
        const target = nodes.get(edge.target);
        if (!target) {
          throw new BadRequestException(
            `IR-ul refera nodul inexistent "${edge.target}".`,
          );
        }
        await visit(target, {
          itemIndex: token.itemIndex,
          current: this.asRecord(
            node.type === 'condition'
              ? output?.value
              : output,
          ),
          sourceNodeId: node.id,
        });
      }
    };

    await visit(start, {
      itemIndex: 0,
      current: this.asRecord(
        context.record ?? {},
      ),
    });

    const leafOutput = leaves.reduce<
      Record<string, any>
    >((result, value) => {
      if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
      ) {
        return { ...result, ...value };
      }
      return result;
    }, {});
    return context.trigger.includes('.before_')
      ? {
          ...(context.record ?? {}),
          ...leafOutput,
        }
      : leafOutput;
  }

  private assertCanRun(
    context: WorkflowExecutionContext,
  ) {
    if (
      context.signal.aborted ||
      Date.now() >= context.deadlineAt
    ) {
      throw new RequestTimeoutException(
        'Workflow-ul a depasit limita de 60 de secunde.',
      );
    }
    if (context.nodeRunCount >= MAX_NODE_RUNS) {
      throw new BadRequestException(
        `Workflow-ul a depasit limita de ${MAX_NODE_RUNS} rulari de nod.`,
      );
    }
  }

  private parseIr(value: unknown): WorkflowIrV1 {
    const ir =
      typeof value === 'string'
        ? (JSON.parse(value) as WorkflowIrV1)
        : (value as WorkflowIrV1);
    if (
      !ir ||
      ir.irVersion !== 1 ||
      !Array.isArray(ir.nodes)
    ) {
      throw new BadRequestException(
        'Revizia workflow-ului are un IR incompatibil.',
      );
    }
    return ir;
  }

  private asRecord(
    value: any,
  ): Record<string, any> {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      return value;
    }
    return { value };
  }
}
