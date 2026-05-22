import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { N8nApiClient, N8nWorkflowJson } from './n8n-api.client';

interface NodeDefinition {
  id: string;
  type: string;
  position: { x: number; y: number };
  parameters?: Record<string, any>;
  name?: string;
}

interface ConnectionDefinition {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

@Injectable()
export class WorkflowSyncService {
  private readonly logger = new Logger(WorkflowSyncService.name);
  private readonly webhookBaseUrl: string;

  constructor(
    private readonly n8nClient: N8nApiClient,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
  ) {
    this.webhookBaseUrl = config.get<string>(
      'APP_WEBHOOK_BASE_URL',
      'http://localhost:4000/api',
    );
  }

  private get knex() {
    return this.tenantContext.knex;
  }

  async syncWorkflow(workflowId: string): Promise<string> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const n8nJson = this.translateToN8n(workflow);

    if (workflow.n8n_workflow_id) {
      await this.n8nClient.updateWorkflow(workflow.n8n_workflow_id, n8nJson);
      this.logger.log(
        `Synced workflow "${workflow.slug}" → n8n:${workflow.n8n_workflow_id}`,
      );
      return workflow.n8n_workflow_id;
    }

    const created = await this.n8nClient.createWorkflow(n8nJson);

    await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .update({
        n8n_workflow_id: created.id,
        date_updated: new Date(),
      });

    this.logger.log(
      `Created n8n workflow "${workflow.slug}" → n8n:${created.id}`,
    );
    return created.id;
  }

  async activateWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    let n8nId = workflow.n8n_workflow_id;
    if (!n8nId) {
      n8nId = await this.syncWorkflow(workflowId);
    }

    const hasWebhookTrigger = this.workflowHasActivatableTrigger(workflow);

    if (hasWebhookTrigger) {
      await this.n8nClient.activateWorkflow(n8nId);
      this.logger.log(`Activated workflow "${workflow.slug}" in n8n`);
    } else {
      this.logger.log(
        `Workflow "${workflow.slug}" uses manual/API trigger — marked active locally (n8n executes on-demand)`,
      );
    }

    await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .update({ status: 'active', date_updated: new Date() });

    this.logger.log(`Activated workflow "${workflow.slug}"`);
  }

  async deactivateWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (!workflow?.n8n_workflow_id) return;

    if (this.workflowHasActivatableTrigger(workflow)) {
      await this.n8nClient.deactivateWorkflow(workflow.n8n_workflow_id);
    }

    await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .update({ status: 'paused', date_updated: new Date() });

    this.logger.log(`Deactivated workflow "${workflow.slug}"`);
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (workflow?.n8n_workflow_id) {
      try {
        await this.n8nClient.deleteWorkflow(workflow.n8n_workflow_id);
      } catch (err) {
        this.logger.warn(
          `Failed to delete n8n workflow ${workflow.n8n_workflow_id}: ${err.message}`,
        );
      }
    }
  }

  async executeWorkflow(
    workflowId: string,
    inputData: Record<string, any>,
  ): Promise<{ executionId: string }> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    let n8nId = workflow.n8n_workflow_id;
    if (!n8nId) {
      n8nId = await this.syncWorkflow(workflowId);
    }

    const execution = await this.n8nClient.executeWorkflow(n8nId, inputData);

    this.logger.log(
      `Executed workflow "${workflow.slug}" → execution:${execution.id}`,
    );

    return { executionId: execution.id };
  }

  @OnEvent('action.executed')
  async onActionExecuted(payload: {
    workflowId: string | null;
    actionSlug: string;
    entitySlug: string;
    entityId: string;
    recordId: string | null;
    record: Record<string, any>;
    userId: string | null;
    tenantSlug: string;
    tenantDb: string;
    timestamp: Date;
  }) {
    if (!payload.workflowId) return;

    try {
      await this.executeWorkflow(payload.workflowId, {
        trigger: 'action',
        action: payload.actionSlug,
        entity: payload.entitySlug,
        entityId: payload.entityId,
        recordId: payload.recordId,
        record: payload.record,
        userId: payload.userId,
        tenant: payload.tenantSlug,
        dbName: payload.tenantDb,
        timestamp: payload.timestamp.toISOString(),
        callbackUrl: `${this.webhookBaseUrl}/v1/webhooks/n8n/${payload.tenantSlug}`,
      });
    } catch (err) {
      this.logger.error(
        `Failed to execute workflow for action "${payload.actionSlug}": ${err.message}`,
      );
    }
  }

  private workflowHasActivatableTrigger(workflow: { nodes: any }): boolean {
    const nodes: NodeDefinition[] =
      typeof workflow.nodes === 'string'
        ? JSON.parse(workflow.nodes)
        : workflow.nodes ?? [];

    const activatableTypes = ['webhook_trigger'];
    return nodes.some((n) => activatableTypes.includes(n.type));
  }

  private translateToN8n(workflow: {
    name: string;
    slug: string;
    nodes: any;
    connections: any;
  }): N8nWorkflowJson {
    const nodes: NodeDefinition[] =
      typeof workflow.nodes === 'string'
        ? JSON.parse(workflow.nodes)
        : workflow.nodes ?? [];

    const connections: ConnectionDefinition[] =
      typeof workflow.connections === 'string'
        ? JSON.parse(workflow.connections)
        : workflow.connections ?? [];

    const tenantSlug = this.tenantContext.isAvailable
      ? this.tenantContext.slug
      : 'unknown';

    const n8nNodes = nodes.map((node, index) =>
      this.translateNode(node, index),
    );

    const n8nConnections = this.translateConnections(connections, nodes);

    return {
      name: `[${tenantSlug}] ${workflow.name}`,
      nodes: n8nNodes,
      connections: n8nConnections,
      settings: {
        executionOrder: 'v1',
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  private translateNode(
    node: NodeDefinition,
    index: number,
  ): Record<string, any> {
    const typeMap: Record<string, string> = {
      trigger: 'n8n-nodes-base.manualTrigger',
      webhook_trigger: 'n8n-nodes-base.webhook',
      http_request: 'n8n-nodes-base.httpRequest',
      email: 'n8n-nodes-base.emailSend',
      condition: 'n8n-nodes-base.if',
      delay: 'n8n-nodes-base.wait',
      set_data: 'n8n-nodes-base.set',
      code: 'n8n-nodes-base.code',
      app_get_record: 'n8n-nodes-base.httpRequest',
      app_update_record: 'n8n-nodes-base.httpRequest',
      app_create_record: 'n8n-nodes-base.httpRequest',
    };

    const n8nType = typeMap[node.type] ?? 'n8n-nodes-base.noOp';
    const name = node.name ?? `${node.type}_${index}`;

    const n8nNode: Record<string, any> = {
      id: node.id,
      name,
      type: n8nType,
      typeVersion: 1,
      position: [node.position?.x ?? index * 250, node.position?.y ?? 0],
      parameters: this.translateParameters(node.type, node.parameters ?? {}),
    };

    return n8nNode;
  }

  private translateParameters(
    nodeType: string,
    params: Record<string, any>,
  ): Record<string, any> {
    switch (nodeType) {
      case 'app_get_record':
        return {
          method: 'GET',
          url: `${this.webhookBaseUrl}/v1/data/${params.entity ?? ''}/${params.recordId ?? '{{$json.recordId}}'}`,
          authentication: 'genericCredentialType',
          options: {},
        };

      case 'app_update_record':
        return {
          method: 'PUT',
          url: `${this.webhookBaseUrl}/v1/data/${params.entity ?? ''}/${params.recordId ?? '{{$json.recordId}}'}`,
          sendBody: true,
          bodyParameters: {
            parameters: Object.entries(params.fields ?? {}).map(
              ([key, value]) => ({ name: key, value }),
            ),
          },
          options: {},
        };

      case 'app_create_record':
        return {
          method: 'POST',
          url: `${this.webhookBaseUrl}/v1/data/${params.entity ?? ''}`,
          sendBody: true,
          bodyParameters: {
            parameters: Object.entries(params.fields ?? {}).map(
              ([key, value]) => ({ name: key, value }),
            ),
          },
          options: {},
        };

      case 'email':
        return {
          fromEmail: params.from ?? '',
          toEmail: params.to ?? '={{$json.email}}',
          subject: params.subject ?? '',
          text: params.body ?? '',
          options: {},
        };

      case 'condition':
        return {
          conditions: {
            string: [
              {
                value1: params.field ? `={{$json.${params.field}}}` : '',
                operation: params.operator ?? 'equals',
                value2: params.value ?? '',
              },
            ],
          },
        };

      case 'delay':
        return {
          amount: params.duration ?? 1,
          unit: params.unit ?? 'minutes',
        };

      case 'http_request':
        return {
          method: params.method ?? 'GET',
          url: params.url ?? '',
          sendBody: !!params.body,
          options: {},
        };

      case 'code':
        return {
          jsCode: params.code ?? 'return items;',
        };

      default:
        return params;
    }
  }

  private translateConnections(
    connections: ConnectionDefinition[],
    nodes: NodeDefinition[],
  ): Record<string, any> {
    const nodeNameMap = new Map<string, string>();
    nodes.forEach((node, index) => {
      nodeNameMap.set(node.id, node.name ?? `${node.type}_${index}`);
    });

    const n8nConnections: Record<string, any> = {};

    for (const conn of connections) {
      const sourceName = nodeNameMap.get(conn.source);
      if (!sourceName) continue;

      if (!n8nConnections[sourceName]) {
        n8nConnections[sourceName] = { main: [[]] };
      }

      const targetName = nodeNameMap.get(conn.target);
      if (!targetName) continue;

      const outputIndex = conn.sourceHandle === 'false' ? 1 : 0;

      while (n8nConnections[sourceName].main.length <= outputIndex) {
        n8nConnections[sourceName].main.push([]);
      }

      n8nConnections[sourceName].main[outputIndex].push({
        node: targetName,
        type: 'main',
        index: 0,
      });
    }

    return n8nConnections;
  }
}
