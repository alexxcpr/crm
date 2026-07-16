import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { N8nApiClient, N8nWorkflowJson } from './n8n-api.client';
import { withValidationPrefix } from './workflow-error.utils';

const EMPTY_WORKFLOW_FILTER_VALUE = '__MODUVIS_EMPTY_FILTER__';

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

interface FieldMapping {
  key: string;
  sourceType: 'static' | 'current_record' | 'previous_node' | 'relation' | 'expression' | 'node_output';
  sourceNodeId?: string;
  sourceFieldSlug?: string;
  value: string;
}

interface RecordIdSource {
  sourceType: 'static' | 'node_output';
  value: string;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
}

interface FormulaToken {
  type: 'field' | 'literal' | 'operator' | 'group_start' | 'group_end';
  sourceNodeId?: string;
  fieldSlug?: string;
  fieldLabel?: string;
  sourceLabel?: string;
  dataType?: string;
  value?: string;
}

interface NotificationRecipient {
  sourceType: 'static' | 'node_output';
  profileId?: string;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
}

interface TextTemplateToken {
  type: 'literal' | 'field';
  value?: string;
  sourceNodeId?: string;
  fieldSlug?: string;
}

const MAX_NOTIFICATION_DELAY_MS = 30 * 24 * 60 * 60 * 1000;

@Injectable()
export class WorkflowSyncService {
  private readonly logger = new Logger(WorkflowSyncService.name);
  private readonly webhookBaseUrl: string;
  private readonly webhookSecret: string;

  constructor(
    private readonly n8nClient: N8nApiClient,
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.webhookBaseUrl = config.get<string>(
      'APP_WEBHOOK_BASE_URL',
      'http://localhost:4000/api',
    );
    this.webhookSecret = config.get<string>('N8N_WEBHOOK_SECRET', '');
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
      throw new Error(
        `Workflow "${workflow.slug}" is not synced to n8n. Save or sync it before activation.`,
      );
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
  ): Promise<{ executionId: string; result: any }> {
    const workflow = await this.knex('workflow_definition')
      .where('id_workflow', workflowId)
      .first();

    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    if (!this.workflowHasActivatableTrigger(workflow)) {
      throw new Error(
        `Workflow "${workflow.slug}" does not have a webhook trigger. Add an Event Trigger node to enable external execution.`,
      );
    }

    const n8nId = workflow.n8n_workflow_id;
    if (!n8nId) {
      throw new Error(
        `Workflow "${workflow.slug}" is not synced to n8n. Save or sync it before execution.`,
      );
    }

    // Execution uses the version already synced from the workflow save action.

    const tenantSlug = this.tenantContext.isAvailable
      ? this.tenantContext.slug
      : 'unknown';
    const webhookPath = `crm-${tenantSlug}-${workflow.slug}`;
    const workflowToken = inputData.userId && inputData.profileId
      ? await this.jwt.signAsync({
          sub: inputData.userId,
          profileId: inputData.profileId,
          tenant: this.tenantContext.slug,
          dbName: this.tenantContext.dbName,
          purpose: 'workflow',
        }, { expiresIn: '31d' })
      : null;
    const result = await this.n8nClient.executeWebhook(webhookPath, { ...inputData, workflowToken }, n8nId);

    this.logger.log(
      `Executed workflow "${workflow.slug}" via webhook ${webhookPath}`,
    );

    return { executionId: `webhook:${webhookPath}`, result };
  }

  /**
   * Execută workflow-ul și colectează output-ul (field:value) din ultimul nod.
   * Folosit de BeforeInsert pentru a face merge în DTO înainte de INSERT.
   */
  async executeAndCollect(
    workflowId: string,
    inputData: Record<string, any>,
  ): Promise<Record<string, any>> {
    const { result } = await this.executeWorkflow(workflowId, inputData);
    const items = Array.isArray(result) ? result : [result];
    const collected: Record<string, any> = {};
    for (const item of items) {
      const json = item?.json ?? item;
      if (json && typeof json === 'object' && !Array.isArray(json)) {
        const { success, message, statusCode, error, data, ...rest } = json;
        // Only merge scalar values — skip nested objects (like `data` wrapper from HTTP nodes)
        for (const [key, value] of Object.entries(rest)) {
          if (value === null || typeof value !== 'object') {
            collected[key] = value;
          }
        }
      }
    }
    return collected;
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
    profileId: string | null;
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
        profileId: payload.profileId,
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

  private resolveFieldMappings(
    mappings: FieldMapping[],
    allNodes: NodeDefinition[],
    startNodeId: string,
    itemNodeIds: Set<string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    for (const m of mappings) {
      if (!m.key) continue;
      switch (m.sourceType) {
        case 'static':
          result[m.key] = m.value;
          break;
        case 'current_record':
          result[m.key] = `={{$('${startNodeId}').first().json.body.record.${m.value}}}`;
          break;
        case 'previous_node':
          result[m.key] = `={{$json.${m.value}}}`;
          break;
        case 'expression':
          result[m.key] = m.value;
          break;
        case 'node_output':
          if (m.sourceNodeId && m.sourceFieldSlug) {
            result[m.key] = `={{${this.nodeOutputJsonPath(m.sourceNodeId, allNodes, itemNodeIds)}.${m.sourceFieldSlug}}}`;
          }
          break;
        default:
          result[m.key] = m.value;
      }
    }
    return result;
  }

  private resolveRecordId(
    source: RecordIdSource,
    allNodes: NodeDefinition[],
    _startNodeId: string,
    itemNodeIds: Set<string>,
  ): string {
    if (source.sourceType === 'node_output') {
      return `={{${this.nodeOutputJsonPath(source.sourceNodeId!, allNodes, itemNodeIds)}.${source.sourceFieldSlug}}}`;
    }
    return source.value;
  }

  private resolveFilterValue(
    source: RecordIdSource,
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): string {
    if (!source) return EMPTY_WORKFLOW_FILTER_VALUE;

    if (source.sourceType === 'node_output') {
      if (!source.sourceNodeId || !source.sourceFieldSlug) {
        return EMPTY_WORKFLOW_FILTER_VALUE;
      }

      return `={{${this.nodeOutputJsonPath(source.sourceNodeId, allNodes, itemNodeIds)}?.${source.sourceFieldSlug} ?? "${EMPTY_WORKFLOW_FILTER_VALUE}"}}`;
    }

    return source.value || EMPTY_WORKFLOW_FILTER_VALUE;
  }

  private workflowHasActivatableTrigger(workflow: { nodes: any }): boolean {
    const nodes: NodeDefinition[] =
      typeof workflow.nodes === 'string'
        ? JSON.parse(workflow.nodes)
        : workflow.nodes ?? [];

    const activatableTypes = ['start', 'webhook_trigger', 'trigger'];
    return nodes.some((n) => activatableTypes.includes(n.type));
  }

  private isStartNode(nodeId: string, nodes: NodeDefinition[]): boolean {
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;
    const startTypes = new Set(['start', 'trigger', 'webhook_trigger']);
    return startTypes.has(node.type);
  }

  /** HTTP Request nodes wrap output in { success, data }; Set/Code pass through as-is. */
  private isHttpWrapperNode(nodeId: string, nodes: NodeDefinition[]): boolean {
    const node = nodes.find(n => n.id === nodeId)
    if (!node) return false
    const httpTypes = new Set([
      'app_get_record',
      'app_get_related',
      'app_create_record',
      'app_update_record',
      'system_get_current_profile',
    ])
    return httpTypes.has(node.type)
  }

  private nodeOutputJsonPath(
    nodeId: string,
    nodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): string {
    if (this.isStartNode(nodeId, nodes)) {
      return `$('${nodeId}').first().json.body.record`
    }
    if (itemNodeIds.has(nodeId)) {
      if (this.isHttpWrapperNode(nodeId, nodes)) {
        return `$('${nodeId}').item.json.data`
      }
      return `$('${nodeId}').item.json`
    }
    if (this.isHttpWrapperNode(nodeId, nodes)) {
      return `$('${nodeId}').first().json.data`
    }
    // set_data, code, and other pass-through nodes
    return `$('${nodeId}').first().json`
  }

  /**
   * n8n expressions (={{ ... }}) are only evaluated in query params, body,
   * and headers — NOT in URL path segments. Check whether a value is an
   * n8n expression so we can route it through query params instead.
   */
  private isN8nExpression(value: any): boolean {
    return typeof value === 'string' && (value.startsWith('={{') || value.startsWith('{{'));
  }

  private translateFormulaTokens(
    tokens: FormulaToken[],
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): string {
    const formatDecimalsForText = this.formulaProducesText(tokens)
    let expr = '={{'
    for (const token of tokens) {
      switch (token.type) {
        case 'field': {
          expr += this.translateFormulaField(token, allNodes, itemNodeIds, formatDecimalsForText)
          break
        }
        case 'literal':
          expr += this.translateFormulaLiteral(token.value)
          break
        case 'operator':
          expr += ` ${token.value} `
          break
        case 'group_start':
          expr += '('
          break
        case 'group_end':
          expr += ')'
          break
      }
    }
    expr += '}}'
    return expr
  }

  // ─── Condition / IF node helpers ───

  private translateFormulaLiteral(value: string | undefined): string {
    const text = value ?? ''
    const trimmed = text.trim()
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed
    }
    return JSON.stringify(text)
  }

  private translateFormulaField(
    token: FormulaToken,
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
    formatDecimalsForText: boolean,
  ): string {
    const path = `${this.nodeOutputJsonPath(token.sourceNodeId!, allNodes, itemNodeIds)}.${token.fieldSlug}`
    if (token.dataType === 'numeric' && formatDecimalsForText) {
      return `Number(${path} ?? 0).toFixed(2)`
    }
    if (this.isNumericFormulaDataType(token.dataType)) {
      return `Number(${path} ?? 0)`
    }
    return path
  }

  private formulaProducesText(tokens: FormulaToken[]): boolean {
    return tokens.some((token) => {
      if (token.type === 'literal') {
        return !this.isNumericFormulaLiteral(token.value)
      }
      if (token.type === 'field' && token.dataType) {
        return !this.isNumericFormulaDataType(token.dataType)
      }
      return false
    })
  }

  private isNumericFormulaDataType(dataType: string | undefined): boolean {
    return dataType === 'integer' || dataType === 'numeric'
  }

  private isNumericFormulaLiteral(value: string | undefined): boolean {
    return /^-?\d+(\.\d+)?$/.test((value ?? '').trim())
  }

  private translateConditionOperand(
    operand: any,
    allNodes: NodeDefinition[],
    startNodeId: string,
    itemNodeIds: Set<string>,
  ): string {
    if (!operand) return ''

    if (operand.sourceType === 'static') {
      return operand.value ?? ''
    }

    if (operand.sourceType === 'node_output') {
      if (operand.sourceNodeId && (operand.fieldSlug || operand.columnName)) {
        const field = operand.fieldSlug || operand.columnName
        return `={{${this.nodeOutputJsonPath(operand.sourceNodeId, allNodes, itemNodeIds)}.${field}}}`
      }
      // Fallback: only fieldSlug (no sourceNodeId) → assume $json (immediate predecessor)
      const field = operand.fieldSlug || operand.columnName
      if (field) {
        return `={{$json.${field}}}`
      }
      return ''
    }

    return ''
  }

  private translateConditionOperator(moduvisOp: string, n8nGroup: string): string {
    const map: Record<string, string> = {
      equals: 'equals', notEquals: 'notEquals',
      contains: 'contains', startsWith: 'startsWith', endsWith: 'endsWith',
      regex: 'regex',
      larger: 'larger', smaller: 'smaller', largerEqual: 'largerEqual', smallerEqual: 'smallerEqual',
      divisibleBy: 'divisibleBy',
      after: 'after', before: 'before', afterEqual: 'afterEqual', beforeEqual: 'beforeEqual',
      isNull: 'isEmpty', isNotNull: 'isNotEmpty',
      true: 'true', false: 'false',
      // legacy operators
      greaterThan: n8nGroup === 'dateTime' ? 'after' : 'larger',
      lessThan: n8nGroup === 'dateTime' ? 'before' : 'smaller',
    }
    return map[moduvisOp] ?? 'equals'
  }

  private isUnaryConditionOperator(op: string): boolean {
    const unary = new Set(['isNull', 'isNotNull', 'true', 'false', 'isEmpty', 'isNotEmpty'])
    return unary.has(op)
  }

  private mapDataTypeToN8nGroup(dataType: string): 'string' | 'number' | 'boolean' | 'dateTime' {
    switch (dataType) {
      case 'varchar': case 'text': case 'uuid': return 'string'
      case 'integer': case 'numeric': return 'number'
      case 'boolean': return 'boolean'
      case 'datetime': return 'dateTime'
      default: return 'string'
    }
  }

  private computeItemNodeIds(
    nodes: NodeDefinition[],
    connections: ConnectionDefinition[],
  ): Set<string> {
    const itemNodeIds = new Set<string>();
    const queue = nodes.filter((node) => node.type === 'for_each').map((node) => node.id);

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (itemNodeIds.has(nodeId)) continue;
      itemNodeIds.add(nodeId);

      for (const conn of connections.filter((item) => item.source === nodeId)) {
        if (!itemNodeIds.has(conn.target)) {
          queue.push(conn.target);
        }
      }
    }

    return itemNodeIds;
  }

  private buildForEachCode(): string {
    return [
      'const source = items[0]?.json ?? {};',
      'const records = Array.isArray(source.data) ? source.data : null;',
      "if (!records) {",
      "  throw new Error('Nodul Pentru fiecare asteapta o lista de inregistrari in data[].');",
      '}',
      'return records.map((record, index) => ({',
      '  json: { ...record, _foreach_index: index },',
      '}));',
    ].join('\n');
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

    const startNode = nodes.find(
      (n) => ['start', 'trigger', 'webhook_trigger'].includes(n.type),
    );
    const startEntitySlug = startNode?.parameters?.entity ?? '';
    const startNodeId = startNode?.id ?? '';
    const itemNodeIds = this.computeItemNodeIds(nodes, connections);
    this.validateNotificationDelays(nodes, connections);

    const n8nNodes = nodes.map((node, index) =>
      this.translateNode(node, index, tenantSlug, startEntitySlug, startNodeId, nodes, itemNodeIds),
    );

    for (const node of nodes.filter((n) => n.type === 'validate')) {
      n8nNodes.push(this.buildValidationErrorNode(node));
    }

    // Set predictable webhook path so we can call it from the CRM
    const webhookPath = `crm-${tenantSlug}-${workflow.slug}`;
    for (const n8nNode of n8nNodes) {
      if (n8nNode.type === 'n8n-nodes-base.webhook' && n8nNode.parameters) {
        n8nNode.parameters.path = webhookPath;
      }
    }

    const n8nConnections = this.translateConnections(connections, nodes);
    this.attachValidationErrorBranches(n8nConnections, nodes);

    return {
      name: `[${tenantSlug}] ${workflow.name}`,
      nodes: n8nNodes,
      connections: n8nConnections,
      settings: {
        executionOrder: 'v0',
        saveManualExecutions: true,
        callerPolicy: 'workflowsFromSameOwner',
      },
    };
  }

  private translateNode(
    node: NodeDefinition,
    index: number,
    tenantSlug: string,
    startEntitySlug: string,
    startNodeId: string,
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): Record<string, any> {
    const typeMap: Record<string, string> = {
      start: 'n8n-nodes-base.webhook',
      // backward compat — old node types, treat as start
      trigger: 'n8n-nodes-base.webhook',
      webhook_trigger: 'n8n-nodes-base.webhook',
      http_request: 'n8n-nodes-base.httpRequest',
      email: 'n8n-nodes-base.emailSend',
      condition: 'n8n-nodes-base.if',
      validate: 'n8n-nodes-base.if',
      stop_error: 'n8n-nodes-base.stopAndError',
      delay: 'n8n-nodes-base.wait',
      set_data: 'n8n-nodes-base.set',
      code: 'n8n-nodes-base.code',
      app_get_record: 'n8n-nodes-base.httpRequest',
      app_get_related: 'n8n-nodes-base.httpRequest',
      app_update_record: 'n8n-nodes-base.httpRequest',
      app_create_record: 'n8n-nodes-base.httpRequest',
      notification: 'n8n-nodes-base.httpRequest',
      for_each: 'n8n-nodes-base.code',
      system_get_current_profile: 'n8n-nodes-base.httpRequest',
    };

    // Detect self-update (same entity as start, no external recordId) → translate as set node
    let resolvedType = node.type;
    if (node.type === 'app_update_record') {
      const params = node.parameters ?? {};
      const targetEntity: string = params.entity ?? '';
      const recordIdSrc = params.recordIdSource as RecordIdSource | null;
      // A recordId coming from the start node means "update myself" — in BeforeInsert
      // the record doesn't have an id yet, so we must merge via set_data.
      const recordIdFromStart =
        recordIdSrc?.sourceNodeId === startNodeId && !!recordIdSrc?.value;
      const hasExternalRecordId =
        !!params.recordId || (!!recordIdSrc?.value && !recordIdFromStart);
      if ((!targetEntity || targetEntity === startEntitySlug) && !hasExternalRecordId) {
        resolvedType = 'set_data';
      }
    }

    const n8nType = typeMap[resolvedType] ?? 'n8n-nodes-base.noOp';
    // Use node.id as n8n node name for stable cross-node referencing via $('<id>')
    const name = node.id;

    const n8nNode: Record<string, any> = {
      id: node.id,
      name,
      type: n8nType,
      typeVersion: n8nType === 'n8n-nodes-base.httpRequest' ? 4 : 1,
      position: [node.position?.x ?? index * 250, node.position?.y ?? 0],
      parameters: this.translateParameters(
        node.type,
        node.type === 'notification'
          ? { ...(node.parameters ?? {}), sourceNodeId: node.id }
          : (node.parameters ?? {}),
        tenantSlug,
        startEntitySlug,
        startNodeId,
        allNodes,
        itemNodeIds,
      ),
    };

    return n8nNode;
  }

  private translateParameters(
    nodeType: string,
    params: Record<string, any>,
    tenantSlug: string,
    startEntitySlug: string,
    startNodeId: string,
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): Record<string, any> {
    const webhookDataBase = `${this.webhookBaseUrl}/v1/webhooks/n8n/${tenantSlug}/data`;

    const webhookHeaders = {
      sendHeaders: true,
      headerParameters: {
        parameters: [
          ...(this.webhookSecret ? [{ name: 'x-webhook-secret', value: this.webhookSecret }] : []),
          { name: 'x-tenant', value: tenantSlug },
          { name: 'x-workflow-token', value: `={{ $('${startNodeId}').first().json.body.workflowToken }}` },
        ],
      },
    };

    switch (nodeType) {
      case 'system_get_current_profile':
        return {
          method: 'GET',
          url: `${this.webhookBaseUrl}/v1/webhooks/n8n/${tenantSlug}/current-profile`,
          authentication: 'none',
          ...webhookHeaders,
          options: {},
        };

      case 'app_get_record': {
          const filters: any[] = params.filters ?? []
          const limit: number | null = params.limit ?? null

          const queryParams: { name: string; value: string }[] = [
            { name: 'entity', value: params.entity || `={{ $('${startNodeId}').first().json.body.entity }}` },
          ]

          for (const f of filters) {
            if (!f.field || !f.operator) continue
            const filterValue = this.resolveFilterValue(
              f.valueSource as RecordIdSource,
              allNodes,
              itemNodeIds,
            )
            queryParams.push({
              name: `filter[${f.field}][${f.operator}]`,
              value: filterValue,
            })
          }

          queryParams.push({ name: 'limit', value: limit != null ? String(limit) : 'all' })

          return {
            method: 'GET',
            url: `${webhookDataBase}-list`,
            authentication: 'none',
            sendQuery: true,
            queryParameters: { parameters: queryParams },
            ...webhookHeaders,
            options: {},
          }
        }

      case 'app_get_related': {
          const relEntity = !!params.relationEntitySlug;
          const relRecId: string | undefined = params.relationRecordIdExpr;
          const relRecIdIsExpr = this.isN8nExpression(relRecId);

          // Direct URL only when both values are static (n8n doesn't evaluate expressions in URL paths)
          if (relEntity && relRecId && !relRecIdIsExpr) {
            return {
              method: 'GET',
              url: `${webhookDataBase}/${params.relationEntitySlug}/${relRecId}`,
              authentication: 'none',
              ...webhookHeaders,
              options: {},
            };
          }

          return {
            method: 'GET',
            url: `${webhookDataBase}-resolve`,
            authentication: 'none',
            sendQuery: true,
            queryParameters: {
              parameters: [
                { name: 'entity', value: relEntity ? params.relationEntitySlug : `={{ $('${startNodeId}').first().json.body.entity }}` },
                { name: 'id', value: relRecId || `={{ $('${startNodeId}').first().json.body.recordId }}` },
              ],
            },
            ...webhookHeaders,
            options: {},
          };
        }

      case 'app_update_record': {
          const targetEntity = params.entity ?? '';
          const recordIdSrc = params.recordIdSource as RecordIdSource | null;
          const recordIdFromStart =
            recordIdSrc?.sourceNodeId === startNodeId && !!recordIdSrc?.value;
          const hasExternalRecordId =
            !!params.recordId || (!!recordIdSrc?.value && !recordIdFromStart);
          const isSelfUpdate =
            (!targetEntity || targetEntity === startEntitySlug) && !hasExternalRecordId;

          const resolvedFields =
            params.fieldMappings?.length
              ? this.resolveFieldMappings(params.fieldMappings, allNodes, startNodeId, itemNodeIds)
              : (params.fields ?? {});

          // Self-entity update without recordId → DTO merge mode (BeforeInsert)
          if (isSelfUpdate) {
            const values = Object.entries(resolvedFields).map(([key, value]) => ({
              name: key,
              value,
            }));
            return {
              values: { string: values },
              keepOnlySet: false,
            };
          }

          const resolvedRecordId = params.recordIdSource
            ? this.resolveRecordId(params.recordIdSource, allNodes, startNodeId, itemNodeIds)
            : params.recordId;

          const updRecId = !!resolvedRecordId;
          const recIdIsExpr = this.isN8nExpression(resolvedRecordId);

          const shared = {
            method: 'PUT' as const,
            authentication: 'none' as const,
            sendBody: true,
            bodyParameters: {
              parameters: Object.entries(resolvedFields).map(
                ([key, value]) => ({ name: key, value }),
              ),
            },
            ...webhookHeaders,
            options: {},
          };

          // Direct URL only when both values are static (n8n doesn't evaluate expressions in URL paths)
          if (targetEntity && updRecId && !recIdIsExpr) {
            return { ...shared, url: `${webhookDataBase}/${params.entity}/${resolvedRecordId}` };
          }

          return {
            ...shared,
            url: `${webhookDataBase}-resolve`,
            sendQuery: true,
            queryParameters: {
              parameters: [
                { name: 'entity', value: targetEntity ? params.entity : `={{ $('${startNodeId}').first().json.body.entity }}` },
                { name: 'id', value: updRecId ? resolvedRecordId : `={{ $('${startNodeId}').first().json.body.recordId }}` },
              ],
            },
          };
        }

      case 'app_create_record': {
          const createEntity = !!params.entity;
          const entityIsExpr = this.isN8nExpression(params.entity);

          const resolvedFields =
            params.fieldMappings?.length
              ? this.resolveFieldMappings(params.fieldMappings, allNodes, startNodeId, itemNodeIds)
              : (params.fields ?? {});

          const shared = {
            method: 'POST' as const,
            authentication: 'none' as const,
            sendBody: true,
            bodyParameters: {
              parameters: [
                ...Object.entries(resolvedFields).map(
                  ([key, value]) => ({ name: key, value }),
                ),
                { name: 'id_profile', value: `={{ $('${startNodeId}').first().json.body.profileId }}` },
              ],
            },
            ...webhookHeaders,
            options: {},
          };

          // Direct URL only when entity is static (n8n doesn't evaluate expressions in URL paths)
          if (createEntity && !entityIsExpr) {
            return { ...shared, url: `${webhookDataBase}/${params.entity}` };
          }

          return {
            ...shared,
            url: `${webhookDataBase}-resolve`,
            sendQuery: true,
            queryParameters: {
              parameters: [
                { name: 'entity', value: createEntity ? params.entity : `={{ $('${startNodeId}').first().json.body.entity }}` },
              ],
            },
          };
        }

      case 'email':
        return {
          fromEmail: params.from ?? '',
          toEmail: params.to ?? '={{$json.email}}',
          subject: params.subject ?? '',
          text: params.body ?? '',
          options: {},
        };

      case 'notification': {
        const recipient = params.recipient as NotificationRecipient | undefined;
        const recipientProfileId = recipient?.sourceType === 'node_output'
          ? `={{${this.nodeOutputJsonPath(recipient.sourceNodeId!, allNodes, itemNodeIds)}.${recipient.sourceFieldSlug}}}`
          : recipient?.profileId ?? '';
        const targetSourceNodeId = params.targetSourceNodeId as string | undefined;

        const bodyParameters: { name: string; value: any }[] = [
          { name: 'recipientProfileId', value: recipientProfileId },
          { name: 'subject', value: this.translateTextTemplate(params.subjectTokens ?? [], allNodes, itemNodeIds) },
          { name: 'content', value: this.translateTextTemplate(params.contentTokens ?? [], allNodes, itemNodeIds) },
          { name: 'sourceExecutionId', value: '={{String($execution.id)}}' },
          { name: 'sourceNodeId', value: params.sourceNodeId ?? '' },
          { name: 'sourceRunIndex', value: '={{Number($runIndex ?? 0)}}' },
          { name: 'sourceItemIndex', value: '={{Number($itemIndex ?? 0)}}' },
        ];

        if (targetSourceNodeId && params.targetEntitySlug) {
          bodyParameters.push(
            { name: 'targetEntitySlug', value: params.targetEntitySlug },
            {
              name: 'targetRecordId',
              value: `={{${this.nodeOutputJsonPath(targetSourceNodeId, allNodes, itemNodeIds)}.id}}`,
            },
          );
        }

        return {
          method: 'POST',
          url: `${this.webhookBaseUrl}/v1/webhooks/n8n/${tenantSlug}/notifications`,
          authentication: 'none',
          sendBody: true,
          bodyParameters: { parameters: bodyParameters },
          ...webhookHeaders,
          options: {},
        };
      }

      case 'condition':
      case 'validate': {
        const conditions: any[] = params.conditions ?? []
        const combinator = params.combinator ?? 'and'
        const result: Record<string, any> = {
          conditions: {},
          options: { combinators: [combinator] },
        }

        for (const cond of conditions) {
          if (!cond.leftOperand || !cond.operator) continue

          const leftType = cond.leftOperand.dataType ?? 'varchar'
          const n8nGroup = this.mapDataTypeToN8nGroup(leftType)

          if (!result.conditions[n8nGroup]) {
            result.conditions[n8nGroup] = []
          }

          const entry: any = {
            value1: this.translateConditionOperand(cond.leftOperand, allNodes, startNodeId, itemNodeIds),
            operation: this.translateConditionOperator(cond.operator, n8nGroup),
          }

          if (!this.isUnaryConditionOperator(cond.operator)) {
            entry.value2 = this.translateConditionOperand(
              cond.rightOperand ?? { sourceType: 'static', value: '' },
              allNodes,
              startNodeId,
              itemNodeIds,
            )
          }

          result.conditions[n8nGroup].push(entry)
        }

        if (Object.keys(result.conditions).length === 0) {
          result.conditions.string = []
        }

        return result
      }

      case 'stop_error':
        return {
          errorType: 'errorMessage',
          errorMessage: withValidationPrefix(params.message),
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

      case 'for_each':
        return {
          jsCode: this.buildForEachCode(),
        };

      case 'code':
        return {
          jsCode: params.code ?? 'return items;',
        };

      case 'set_data': {
        const assignments: any[] = params.assignments ?? []
        const values = assignments.map(a => ({
          name: a.key,
          value: this.translateFormulaTokens(a.tokens ?? [], allNodes, itemNodeIds),
        }))
        return {
          values: { string: values },
          keepOnlySet: false,
        }
      }

      case 'start':
      case 'webhook_trigger':
      case 'trigger':
        return {
          httpMethod: 'POST',
          path: '',
          responseMode: 'lastNode',
          options: {},
        };

      default:
        return params;
    }
  }

  private translateTextTemplate(
    tokens: TextTemplateToken[],
    allNodes: NodeDefinition[],
    itemNodeIds: Set<string>,
  ): string {
    const parts = tokens.map((token) => {
      if (token.type === 'field' && token.sourceNodeId && token.fieldSlug) {
        const path = `${this.nodeOutputJsonPath(token.sourceNodeId, allNodes, itemNodeIds)}.${token.fieldSlug}`;
        return `String(${path} ?? '')`;
      }
      return JSON.stringify(token.value ?? '');
    });
    return `={{${parts.length ? parts.join(' + ') : "''"}}}`;
  }

  private validateNotificationDelays(
    nodes: NodeDefinition[],
    connections: ConnectionDefinition[],
  ): void {
    const notifications = nodes.filter((node) => node.type === 'notification');
    if (!notifications.length) return;

    const byId = new Map(nodes.map((node) => [node.id, node]));
    const parents = new Map<string, string[]>();
    for (const connection of connections) {
      const current = parents.get(connection.target) ?? [];
      current.push(connection.source);
      parents.set(connection.target, current);
    }

    const delayMs = (node?: NodeDefinition): number => {
      if (!node || node.type !== 'delay') return 0;
      const duration = Number(node.parameters?.duration ?? 0);
      const unit = node.parameters?.unit ?? 'minutes';
      const multiplier: Record<string, number> = {
        seconds: 1000,
        minutes: 60_000,
        hours: 3_600_000,
        days: 86_400_000,
      };
      return Math.max(0, duration) * (multiplier[unit] ?? multiplier.minutes);
    };

    const memo = new Map<string, number>();
    const visit = (nodeId: string, visiting: Set<string>): number => {
      if (memo.has(nodeId)) return memo.get(nodeId)!;
      if (visiting.has(nodeId)) {
        throw new BadRequestException('Workflow-ul contine un ciclu inaintea unui nod de notificare.');
      }
      const nextVisiting = new Set(visiting).add(nodeId);
      const upstream = parents.get(nodeId) ?? [];
      const total = upstream.reduce((maximum, parentId) => {
        return Math.max(maximum, visit(parentId, nextVisiting) + delayMs(byId.get(parentId)));
      }, 0);
      memo.set(nodeId, total);
      return total;
    };

    for (const notification of notifications) {
      if (visit(notification.id, new Set()) > MAX_NOTIFICATION_DELAY_MS) {
        throw new BadRequestException(
          `Nodul de notificare "${notification.name ?? notification.id}" depaseste durata maxima cumulata de 30 de zile.`,
        );
      }
    }
  }

  private translateConnections(
    connections: ConnectionDefinition[],
    nodes: NodeDefinition[],
  ): Record<string, any> {
    const nodeNameMap = new Map<string, string>();
    nodes.forEach((node) => {
      // n8n node name = node.id (stable, used for $('<id>') references)
      nodeNameMap.set(node.id, node.id);
    });

    const n8nConnections: Record<string, any> = {};

    for (const conn of connections) {
      const sourceNode = nodes.find((node) => node.id === conn.source);
      if (sourceNode?.type === 'stop_error') continue;

      const sourceName = nodeNameMap.get(conn.source);
      if (!sourceName) continue;

      if (!n8nConnections[sourceName]) {
        n8nConnections[sourceName] = { main: [[]] };
      }

      const targetName = nodeNameMap.get(conn.target);
      if (!targetName) continue;

      const outputIndex =
        sourceNode?.type === 'validate'
          ? 1
          : conn.sourceHandle === 'false' ? 1 : 0;

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

  private buildValidationErrorNode(node: NodeDefinition): Record<string, any> {
    const id = `${node.id}__validation_error`;
    return {
      id,
      name: id,
      type: 'n8n-nodes-base.stopAndError',
      typeVersion: 1,
      position: [
        (node.position?.x ?? 0) + 250,
        (node.position?.y ?? 0) + 130,
      ],
      parameters: {
        errorType: 'errorMessage',
        errorMessage: withValidationPrefix(node.parameters?.message),
      },
    };
  }

  private attachValidationErrorBranches(
    n8nConnections: Record<string, any>,
    nodes: NodeDefinition[],
  ): void {
    for (const node of nodes.filter((n) => n.type === 'validate')) {
      if (!n8nConnections[node.id]) {
        n8nConnections[node.id] = { main: [[]] };
      }

      while (n8nConnections[node.id].main.length <= 1) {
        n8nConnections[node.id].main.push([]);
      }

      n8nConnections[node.id].main[0].push({
        node: `${node.id}__validation_error`,
        type: 'main',
        index: 0,
      });
    }
  }
}
