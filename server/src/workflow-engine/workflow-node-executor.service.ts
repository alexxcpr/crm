import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { DocumentRuntimeService } from 'src/documents/document-runtime.service';
import type { DocumentHandle } from 'src/documents/document.types';
import { DynamicDataService } from 'src/dynamic-data/dynamic-data.service';
import { SmtpMailService } from 'src/integrations/smtp-mail.service';
import { NotificationsService } from 'src/notifications/notifications.service';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type {
  NodeOutput,
  WorkflowExecutionContext,
  WorkflowExecutionToken,
  WorkflowIrNode,
} from './workflow-engine.types';
import {
  formatWorkflowDate,
  isWorkflowDateFormatPreset,
} from './workflow-date-formatter';
import { WorkflowHttpClientService } from './workflow-http-client.service';

interface ExecuteNodeInput {
  context: WorkflowExecutionContext;
  node: WorkflowIrNode;
  token: WorkflowExecutionToken;
  runIndex: number;
}

@Injectable()
export class WorkflowNodeExecutorService {
  constructor(
    private readonly data: DynamicDataService,
    private readonly mail: SmtpMailService,
    private readonly notifications: NotificationsService,
    private readonly documents: DocumentRuntimeService,
    private readonly http: WorkflowHttpClientService,
    private readonly tenantContext: TenantContext,
  ) {}

  async execute(
    input: ExecuteNodeInput,
  ): Promise<any> {
    const { context, node, token, runIndex } =
      input;
    const config = node.config ?? {};

    switch (node.type) {
      case 'start':
        return {
          ...(context.record ?? {}),
          record: context.record ?? {},
          previousData:
            context.previousData ?? null,
          recordId:
            context.recordId ??
            context.record?.id ??
            null,
          entity:
            context.entitySlug ??
            config.entity ??
            null,
        };
      case 'system_get_current_profile':
        return { ...context.actor.profile };
      case 'app_get_record':
        return this.getRecords(
          context,
          config,
          token,
        );
      case 'app_get_related':
        return this.getRelated(
          context,
          config,
          token,
        );
      case 'app_create_record':
        return this.createRecord(
          context,
          config,
          token,
        );
      case 'app_update_record':
        return this.updateRecord(
          context,
          config,
          token,
        );
      case 'email':
        return this.mail.sendWorkflowEmail(
          String(config.integrationId ?? ''),
          String(
            this.resolveValue(
              config.to,
              context,
              token,
            ) ?? '',
          ),
          String(
            this.resolveValue(
              config.subject,
              context,
              token,
            ) ?? '',
          ),
          String(
            this.resolveValue(
              config.content ?? config.body,
              context,
              token,
            ) ?? '',
          ),
          {
            signal: context.signal,
            deadlineAt: context.deadlineAt,
          },
        );
      case 'condition':
        return {
          matched: this.evaluateConditions(
            config.conditions,
            config.combinator,
            context,
            token,
          ),
          value: token.current,
        };
      case 'validate': {
        const invalid = this.evaluateConditions(
          config.conditions,
          config.combinator,
          context,
          token,
        );
        if (invalid) {
          throw new BadRequestException(
            String(
              config.message ||
                'Validarea workflow-ului a esuat.',
            ),
          );
        }
        return token.current;
      }
      case 'stop_error':
        throw new BadRequestException(
          String(
            config.message ||
              'Workflow-ul a fost oprit.',
          ),
        );
      case 'set_data':
        return this.setData(
          config,
          context,
          token,
        );
      case 'format_date':
        return this.formatDate(
          config,
          context,
          token,
        );
      case 'notification':
        return this.sendNotification(
          context,
          node,
          token,
          runIndex,
        );
      case 'http_request':
        return this.http.request({
          method: config.method,
          url: String(config.url ?? ''),
          body: this.resolveHttpBody(
            config.body,
            context,
            token,
          ),
          deadlineAt: context.deadlineAt,
          signal: context.signal,
        });
      case 'word_open':
      case 'word_replace_text':
      case 'word_create_table_rows':
      case 'word_insert_table_rows':
      case 'word_convert_to_pdf':
      case 'word_save':
      case 'word_update':
      case 'pdf_open':
      case 'pdf_save':
      case 'pdf_update':
        return this.executeDocument(
          context,
          node,
          token,
          runIndex,
        );
      case 'for_each':
        return this.sourceOutput(
          String(config.sourceNodeId ?? ''),
          context,
          token.itemIndex,
        );
      default:
        throw new BadRequestException(
          `Executorul pentru nodul "${node.type}" nu exista.`,
        );
    }
  }

  private async getRecords(
    context: WorkflowExecutionContext,
    config: Record<string, any>,
    token: WorkflowExecutionToken,
  ) {
    const query: Record<string, any> = {
      limit: config.limit ?? 'all',
      filter: {},
    };
    let missingFilterValue = false;
    for (const filter of config.filters ?? []) {
      if (!filter?.field || !filter?.operator)
        continue;
      const value = this.resolveValue(
        filter.valueSource ?? filter.value,
        context,
        token,
      );
      if (
        value === null ||
        value === undefined ||
        value === ''
      ) {
        missingFilterValue = true;
        continue;
      }
      query.filter[filter.field] ??= {};
      query.filter[filter.field][
        filter.operator
      ] = value;
    }
    if (missingFilterValue) {
      return Number(config.limit) === 1
        ? null
        : [];
    }
    const result = await this.data.findAll(
      await this.resolveEntitySlug(
        config.entityId,
        config.entity || context.entitySlug,
      ),
      query,
      context.actor,
      { tableOnly: false },
    );
    if (Number(config.limit) === 1)
      return result.data[0] ?? null;
    return result.data;
  }

  private formatDate(
    config: Record<string, any>,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ) {
    const value = this.resolveValue(
      config.source,
      context,
      token,
    );
    if (
      value === null ||
      value === undefined ||
      (typeof value === 'string' &&
        value.trim() === '')
    ) {
      throw new BadRequestException(
        'Valoarea datei lipseste.',
      );
    }
    if (
      !isWorkflowDateFormatPreset(
        config.preset,
      )
    ) {
      throw new BadRequestException(
        'Formatul datei nu este valid.',
      );
    }
    try {
      return formatWorkflowDate(
        value,
        config.preset,
      );
    } catch {
      throw new BadRequestException(
        'Valoarea nu este o data valida.',
      );
    }
  }

  private async getRelated(
    context: WorkflowExecutionContext,
    config: Record<string, any>,
    token: WorkflowExecutionToken,
  ) {
    const source = this.sourceOutput(
      String(config.sourceNodeId ?? ''),
      context,
      token.itemIndex,
    );
    const relationId =
      source?.[
        config.relationFieldColumn ??
          config.relationField
      ] ??
      config.relationRecordId ??
      context.recordId;
    if (!relationId) return null;
    const result = await this.data.findOne(
      await this.resolveEntitySlug(
        config.relationEntityId,
        config.relationEntitySlug ||
          context.entitySlug,
      ),
      String(relationId),
      context.actor,
    );
    return result.data;
  }

  private async createRecord(
    context: WorkflowExecutionContext,
    config: Record<string, any>,
    token: WorkflowExecutionToken,
  ) {
    const fields = this.resolveMappings(
      config,
      context,
      token,
    );
    const result = await this.data.create(
      await this.resolveEntitySlug(
        config.entityId,
        config.entity || context.entitySlug,
      ),
      fields,
      context.actor,
    );
    return result.data;
  }

  private async updateRecord(
    context: WorkflowExecutionContext,
    config: Record<string, any>,
    token: WorkflowExecutionToken,
  ) {
    const fields = this.resolveMappings(
      config,
      context,
      token,
    );
    const explicitId =
      this.resolveValue(
        config.recordIdSource,
        context,
        token,
      ) ?? config.recordId;
    const targetEntity =
      await this.resolveEntitySlug(
        config.entityId,
        config.entity || context.entitySlug,
      );
    const isBefore =
      context.trigger.includes('.before_');
    const isCurrentEntity =
      !config.entity ||
      targetEntity === context.entitySlug;

    if (isBefore && isCurrentEntity) {
      const currentRecordId =
        context.recordId ??
        context.record?.id ??
        token.current?.id;
      if (
        explicitId &&
        (!currentRecordId ||
          String(explicitId) !==
            String(currentRecordId))
      ) {
        throw new BadRequestException(
          'In before_* poate fi folosit numai ID-ul recordului curent.',
        );
      }
      Object.assign(context.record ?? {}, fields);
      Object.assign(token.current, fields);
      return token.current;
    }

    const recordId =
      explicitId ??
      context.recordId ??
      context.record?.id;
    if (!recordId) {
      throw new BadRequestException(
        'Nodul Actualizeaza Record nu a putut determina ID-ul.',
      );
    }
    const result = await this.data.update(
      targetEntity,
      String(recordId),
      fields,
      context.actor,
    );
    return result.data;
  }

  private resolveMappings(
    config: Record<string, any>,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): Record<string, any> {
    if (
      Array.isArray(config.fieldMappings) &&
      config.fieldMappings.length
    ) {
      return Object.fromEntries(
        config.fieldMappings
          .filter((mapping: any) => mapping?.key)
          .map((mapping: any) => [
            mapping.key,
            this.resolveValue(
              mapping.valueSource ?? mapping,
              context,
              token,
            ),
          ]),
      );
    }
    return Object.fromEntries(
      Object.entries(config.fields ?? {}).map(
        ([key, value]) => [
          key,
          this.resolveValue(
            value,
            context,
            token,
          ),
        ],
      ),
    );
  }

  private setData(
    config: Record<string, any>,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ) {
    const result = { ...token.current };
    for (const assignment of config.assignments ??
      []) {
      if (!assignment?.key) continue;
      result[assignment.key] =
        this.evaluateFormula(
          assignment.tokens ?? [],
          context,
          token,
        );
    }
    if (context.trigger.includes('.before_')) {
      Object.assign(context.record ?? {}, result);
    }
    return result;
  }

  private async sendNotification(
    context: WorkflowExecutionContext,
    node: WorkflowIrNode,
    token: WorkflowExecutionToken,
    runIndex: number,
  ) {
    const config = node.config;
    const recipient = config.recipient ?? {};
    const recipientProfileId =
      recipient.sourceType === 'node_output'
        ? this.resolveValue(
            {
              sourceType: 'node_output',
              sourceNodeId:
                recipient.sourceNodeId,
              sourceFieldSlug:
                recipient.sourceFieldSlug,
            },
            context,
            token,
          )
        : recipient.profileId;
    const targetSourceNodeId = String(
      config.targetSourceNodeId ?? '',
    );
    const target = targetSourceNodeId
      ? this.sourceOutput(
          targetSourceNodeId,
          context,
          token.itemIndex,
        )
      : null;

    return this.notifications.createFromWorkflow(
      {
        recipientProfileId: String(
          recipientProfileId ?? '',
        ),
        subject: this.renderText(
          config.subjectTokens,
          context,
          token,
        ),
        content: this.renderText(
          config.contentTokens,
          context,
          token,
        ),
        ...(target?.id && config.targetEntitySlug
          ? {
              targetEntitySlug:
                await this.resolveEntitySlug(
                  config.targetEntityId,
                  config.targetEntitySlug,
                ),
              targetRecordId: String(target.id),
            }
          : {}),
        sourceExecutionId: context.executionId,
        sourceNodeId: node.id,
        sourceRunIndex: runIndex,
        sourceItemIndex: token.itemIndex,
      },
      context.actor,
    );
  }

  private async executeDocument(
    context: WorkflowExecutionContext,
    node: WorkflowIrNode,
    token: WorkflowExecutionToken,
    runIndex: number,
  ) {
    const spec = this.documentSpec(node.type);
    const config = node.config;
    const documentOutput =
      config.documentSourceNodeId
        ? this.sourceOutput(
            String(config.documentSourceNodeId),
            context,
            token.itemIndex,
          )
        : null;
    const document =
      (documentOutput?.document_handle ??
        documentOutput?.document ??
        documentOutput) as
        | DocumentHandle
        | undefined;
    const args: Record<string, unknown> = {};
    if (
      !spec.inputPackage ||
      spec.fileIdArgument
    ) {
      const fileId = this.resolveValue(
        config.fileId,
        context,
        token,
      );
      if (fileId) args.id_file = fileId;
    }
    for (const key of [
      'search',
      'replace',
      'nrOfNewRows',
      'fileName',
    ]) {
      if (config[key] !== undefined) {
        args[key] = this.resolveValue(
          config[key],
          context,
          token,
        );
      }
    }
    if (args.nrOfNewRows !== undefined) {
      args.nrOfNewRows = Number(args.nrOfNewRows);
    }
    const response = await this.documents.execute(
      {
        package: spec.package,
        operation: spec.operation,
        executionId: context.executionId,
        idempotencyKey: [
          context.executionId,
          node.id,
          runIndex,
          token.itemIndex,
        ].join(':'),
        ...(spec.inputPackage && document
          ? { document }
          : {}),
        args,
        signal: context.signal,
        deadlineAt: context.deadlineAt,
      },
      context.actor,
    );
    return response.data;
  }

  private documentSpec(type: string): {
    package: 'word' | 'pdf';
    operation: string;
    inputPackage?: 'word' | 'pdf';
    fileIdArgument?: boolean;
  } {
    const specs: Record<string, any> = {
      word_open: {
        package: 'word',
        operation: 'open',
        fileIdArgument: true,
      },
      word_replace_text: {
        package: 'word',
        operation: 'replaceText',
        inputPackage: 'word',
      },
      word_create_table_rows: {
        package: 'word',
        operation: 'createTableRows',
        inputPackage: 'word',
      },
      word_insert_table_rows: {
        package: 'word',
        operation: 'insertTableRows',
        inputPackage: 'word',
      },
      word_convert_to_pdf: {
        package: 'word',
        operation: 'convertToPdf',
        inputPackage: 'word',
      },
      word_save: {
        package: 'word',
        operation: 'save',
        inputPackage: 'word',
      },
      word_update: {
        package: 'word',
        operation: 'update',
        inputPackage: 'word',
        fileIdArgument: true,
      },
      pdf_open: {
        package: 'pdf',
        operation: 'open',
        fileIdArgument: true,
      },
      pdf_save: {
        package: 'pdf',
        operation: 'save',
        inputPackage: 'pdf',
      },
      pdf_update: {
        package: 'pdf',
        operation: 'update',
        inputPackage: 'pdf',
        fileIdArgument: true,
      },
    };
    return specs[type];
  }

  private resolveHttpBody(
    body: unknown,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): unknown {
    const resolved = this.resolveValue(
      body,
      context,
      token,
    );
    if (typeof resolved !== 'string')
      return resolved;
    const value = resolved.trim();
    if (!value) return undefined;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private evaluateConditions(
    conditions: unknown,
    combinator: unknown,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): boolean {
    const list = Array.isArray(conditions)
      ? conditions
      : [];
    if (!list.length) return false;
    const results = list.map((condition: any) =>
      this.evaluateCondition(
        this.resolveValue(
          condition.leftOperand,
          context,
          token,
        ),
        condition.operator,
        this.resolveValue(
          condition.rightOperand,
          context,
          token,
        ),
      ),
    );
    return String(combinator).toLowerCase() ===
      'or'
      ? results.some(Boolean)
      : results.every(Boolean);
  }

  private evaluateCondition(
    left: any,
    operator: string,
    right: any,
  ): boolean {
    switch (operator) {
      case 'equals':
        return (
          this.comparable(left) ===
          this.comparable(right)
        );
      case 'notEquals':
        return (
          this.comparable(left) !==
          this.comparable(right)
        );
      case 'isNull':
      case 'isEmpty':
        return (
          left === null ||
          left === undefined ||
          left === ''
        );
      case 'isNotNull':
      case 'isNotEmpty':
        return (
          left !== null &&
          left !== undefined &&
          left !== ''
        );
      case 'contains':
        return String(left ?? '').includes(
          String(right ?? ''),
        );
      case 'startsWith':
        return String(left ?? '').startsWith(
          String(right ?? ''),
        );
      case 'endsWith':
        return String(left ?? '').endsWith(
          String(right ?? ''),
        );
      case 'regex':
        return new RegExp(
          String(right ?? ''),
        ).test(String(left ?? ''));
      case 'larger':
      case 'greaterThan':
        return Number(left) > Number(right);
      case 'smaller':
      case 'lessThan':
        return Number(left) < Number(right);
      case 'largerEqual':
        return Number(left) >= Number(right);
      case 'smallerEqual':
        return Number(left) <= Number(right);
      case 'divisibleBy':
        return (
          Number(right) !== 0 &&
          Number(left) % Number(right) === 0
        );
      case 'after':
        return (
          new Date(left).getTime() >
          new Date(right).getTime()
        );
      case 'before':
        return (
          new Date(left).getTime() <
          new Date(right).getTime()
        );
      case 'afterEqual':
        return (
          new Date(left).getTime() >=
          new Date(right).getTime()
        );
      case 'beforeEqual':
        return (
          new Date(left).getTime() <=
          new Date(right).getTime()
        );
      case 'true':
        return (
          left === true ||
          left === 'true' ||
          left === 1
        );
      case 'false':
        return (
          left === false ||
          left === 'false' ||
          left === 0
        );
      default:
        return false;
    }
  }

  private comparable(value: any): any {
    if (
      typeof value === 'number' ||
      typeof value === 'boolean'
    )
      return value;
    if (value === null || value === undefined)
      return value;
    return String(value);
  }

  private renderText(
    tokens: unknown,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): string {
    if (!Array.isArray(tokens))
      return String(tokens ?? '');
    return tokens
      .map((part: any) => {
        if (
          part.type === 'text' ||
          part.type === 'literal'
        ) {
          return String(
            part.value ?? part.text ?? '',
          );
        }
        return String(
          this.resolveValue(
            part,
            context,
            token,
          ) ?? '',
        );
      })
      .join('');
  }

  private evaluateFormula(
    tokens: any[],
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): any {
    const values = tokens.map((formulaToken) => {
      if (formulaToken.type === 'operator')
        return formulaToken.value;
      if (formulaToken.type === 'group_start')
        return '(';
      if (formulaToken.type === 'group_end')
        return ')';
      if (formulaToken.type === 'field') {
        return this.sourceField(
          formulaToken.sourceNodeId,
          formulaToken.fieldSlug,
          context,
          token.itemIndex,
        );
      }
      const raw = formulaToken.value ?? '';
      return /^-?\d+(\.\d+)?$/.test(
        String(raw).trim(),
      )
        ? Number(raw)
        : String(raw);
    });
    return this.evaluateFormulaValues(values);
  }

  private evaluateFormulaValues(
    values: any[],
  ): any {
    let index = 0;
    const parsePrimary = (): any => {
      const value = values[index++];
      if (value === '(') {
        const nested = parseAdditive();
        if (values[index] !== ')') {
          throw new BadRequestException(
            'Paranteze invalide in formula.',
          );
        }
        index += 1;
        return nested;
      }
      return value ?? '';
    };
    const parseMultiplicative = (): any => {
      let left = parsePrimary();
      while (
        values[index] === '*' ||
        values[index] === '/'
      ) {
        const operator = values[index++];
        const right = parsePrimary();
        if (
          operator === '/' &&
          Number(right) === 0
        ) {
          throw new BadRequestException(
            'Impartire la zero in formula.',
          );
        }
        left =
          operator === '*'
            ? Number(left) * Number(right)
            : Number(left) / Number(right);
      }
      return left;
    };
    const parseAdditive = (): any => {
      let left = parseMultiplicative();
      while (
        values[index] === '+' ||
        values[index] === '-'
      ) {
        const operator = values[index++];
        const right = parseMultiplicative();
        left =
          operator === '+'
            ? typeof left === 'string' ||
              typeof right === 'string'
              ? String(left ?? '') +
                String(right ?? '')
              : Number(left) + Number(right)
            : Number(left) - Number(right);
      }
      return left;
    };
    const result = parseAdditive();
    if (index !== values.length) {
      throw new BadRequestException(
        'Formula contine tokenuri invalide.',
      );
    }
    return result;
  }

  private resolveValue(
    source: any,
    context: WorkflowExecutionContext,
    token: WorkflowExecutionToken,
  ): any {
    if (source === null || source === undefined)
      return source;
    if (
      typeof source !== 'object' ||
      Array.isArray(source)
    )
      return source;
    if (source.sourceType === 'static')
      return source.value;
    if (
      source.sourceType === 'node_output' ||
      source.sourceNodeId
    ) {
      return this.sourceField(
        source.sourceNodeId,
        source.sourceFieldSlug ??
          source.fieldSlug ??
          source.columnName,
        context,
        token.itemIndex,
      );
    }
    if (
      source.sourceType === 'current_record' ||
      source.sourceType === 'previous_node'
    ) {
      return this.readPath(
        token.current,
        source.value ?? source.fieldSlug,
      );
    }
    return source.value ?? source;
  }

  private sourceField(
    sourceNodeId: string,
    field: string | undefined,
    context: WorkflowExecutionContext,
    itemIndex: number,
  ): any {
    const output = this.sourceOutput(
      sourceNodeId,
      context,
      itemIndex,
    );
    return field
      ? this.readPath(output, field)
      : output;
  }

  private sourceOutput(
    sourceNodeId: string,
    context: WorkflowExecutionContext,
    itemIndex: number,
  ): any {
    const outputs: NodeOutput[] =
      context.outputs.get(sourceNodeId) ?? [];
    const matched =
      [...outputs]
        .reverse()
        .find(
          (output) =>
            output.itemIndex === itemIndex,
        ) ?? outputs.at(-1);
    return matched?.value;
  }

  private readPath(
    value: any,
    path: string | undefined,
  ): any {
    if (!path) return value;
    return String(path)
      .split('.')
      .reduce(
        (current, key) => current?.[key],
        value,
      );
  }

  private async resolveEntitySlug(
    entityId: unknown,
    fallback: unknown,
  ): Promise<string> {
    if (entityId) {
      const entity = await this.tenantContext
        .knex('entity')
        .where('id_entity', String(entityId))
        .first('slug');
      if (!entity) {
        throw new BadRequestException(
          'O entitate referita de workflow nu mai exista.',
        );
      }
      return entity.slug;
    }
    return String(fallback ?? '');
  }
}
