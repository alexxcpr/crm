import { Injectable } from '@nestjs/common';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { NodeRegistryService } from './node-registry.service';
import { WorkflowHttpDomainService } from './http-domain.service';
import type {
  WorkflowCompilationResult,
  WorkflowIrV1,
  WorkflowSourceConnection,
  WorkflowSourceNode,
  WorkflowValidationIssue,
} from './workflow-engine.types';

interface CompileOptions {
  workflowId?: string;
  triggerEvents?: string[];
  scheduleContext?: boolean;
}

const SYSTEM_SOURCE_FIELDS = new Map<
  string,
  { dataType: string }
>([
  ['id', { dataType: 'uuid' }],
  ['date_created', { dataType: 'timestamp' }],
  ['date_updated', { dataType: 'timestamp' }],
  ['id_profile', { dataType: 'uuid' }],
]);

@Injectable()
export class WorkflowCompilerService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly registry: NodeRegistryService,
    private readonly httpDomains: WorkflowHttpDomainService,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async compile(
    sourceNodes: WorkflowSourceNode[],
    sourceConnections: WorkflowSourceConnection[],
    options: CompileOptions = {},
  ): Promise<WorkflowCompilationResult> {
    const errors: WorkflowValidationIssue[] = [];
    const warnings: WorkflowValidationIssue[] =
      [];
    const nodes = Array.isArray(sourceNodes)
      ? sourceNodes
      : [];
    const connections = Array.isArray(
      sourceConnections,
    )
      ? sourceConnections
      : [];
    const nodeIds = new Set<string>();
    const normalizedNodes = nodes.map((node) => ({
      ...node,
      type: [
        'trigger',
        'webhook_trigger',
      ].includes(node.type)
        ? 'start'
        : node.type,
      parameters: node.parameters ?? {},
    }));

    for (const node of normalizedNodes) {
      if (
        !node.id ||
        typeof node.id !== 'string'
      ) {
        errors.push({
          code: 'missing_node_id',
          message:
            'Fiecare nod trebuie sa aiba un ID.',
        });
        continue;
      }
      if (nodeIds.has(node.id)) {
        errors.push({
          code: 'duplicate_node_id',
          message: `ID-ul nodului "${node.id}" este duplicat.`,
          nodeId: node.id,
        });
      }
      nodeIds.add(node.id);

      if (node.type === 'delay') {
        errors.push({
          code: 'unsupported_delay',
          message:
            'Nodul Delay nu mai este suportat.',
          nodeId: node.id,
        });
        continue;
      }
      if (node.type === 'code') {
        errors.push({
          code: 'unsupported_code',
          message:
            'Nodul Cod Custom nu este disponibil in v1.',
          nodeId: node.id,
        });
        continue;
      }
      const definition = this.registry.get(
        node.type,
      );
      if (!definition) {
        errors.push({
          code: 'unknown_node_type',
          message: `Tipul de nod "${node.type}" nu este suportat.`,
          nodeId: node.id,
        });
        continue;
      }
      for (const field of definition.configFields.filter(
        (candidate) => candidate.required,
      )) {
        if (
          this.isMissing(
            node.parameters?.[field.key],
          )
        ) {
          errors.push({
            code: 'required_config_missing',
            message: `Campul "${field.label}" este obligatoriu.`,
            nodeId: node.id,
            field: field.key,
          });
        }
      }
    }

    const startNodes = normalizedNodes.filter(
      (node) => node.type === 'start',
    );
    if (startNodes.length !== 1) {
      errors.push({
        code: 'invalid_start_count',
        message:
          'Workflow-ul trebuie sa aiba exact un nod START.',
      });
    }

    const edges = connections.map(
      (connection, order) => ({
        source: connection.source,
        target: connection.target,
        ...(connection.sourceHandle === 'true' ||
        connection.sourceHandle === 'false'
          ? {
              sourceHandle:
                connection.sourceHandle,
            }
          : {}),
        order,
      }),
    );

    for (const edge of edges) {
      const source = normalizedNodes.find(
        (node) => node.id === edge.source,
      );
      const target = normalizedNodes.find(
        (node) => node.id === edge.target,
      );
      if (!source || !target) {
        errors.push({
          code: 'invalid_connection',
          message:
            'Exista o conexiune catre un nod inexistent.',
        });
        continue;
      }
      if (source.type === 'stop_error') {
        errors.push({
          code: 'terminal_node_connection',
          message:
            'Stop cu Eroare nu poate avea conexiuni de iesire.',
          nodeId: source.id,
        });
      }
      if (
        source.type === 'condition' &&
        !['true', 'false'].includes(
          edge.sourceHandle ?? '',
        )
      ) {
        errors.push({
          code: 'invalid_condition_handle',
          message:
            'Conexiunile conditiei trebuie sa foloseasca true sau false.',
          nodeId: source.id,
        });
      }
      if (
        source.type !== 'condition' &&
        edge.sourceHandle !== undefined
      ) {
        errors.push({
          code: 'unexpected_source_handle',
          message:
            'Doar nodul Conditie poate avea iesiri true/false.',
          nodeId: source.id,
        });
      }
    }

    if (startNodes.length === 1) {
      this.validateReachability(
        startNodes[0].id,
        normalizedNodes,
        edges,
        errors,
      );
      this.validateAcyclic(
        normalizedNodes,
        edges,
        errors,
      );
    }

    const triggerEvents = options.triggerEvents
      ? options.triggerEvents
      : options.workflowId
        ? await this.linkedTriggerEvents(
            options.workflowId,
          )
        : [];
    this.validateBeforePolicy(
      normalizedNodes,
      triggerEvents,
      errors,
    );
    if (options.scheduleContext) {
      this.validateScheduleContext(
        normalizedNodes,
        errors,
      );
    }
    this.validateReferences(
      normalizedNodes,
      edges,
      errors,
    );

    const entityIds = new Set<string>();
    const fieldIds = new Set<string>();
    const integrationIds = new Set<string>();
    const httpDomains = new Set<string>();
    await this.resolveDependencies(
      normalizedNodes,
      entityIds,
      fieldIds,
      integrationIds,
      httpDomains,
      errors,
      edges,
    );
    this.validateConfigConstraints(
      normalizedNodes,
      errors,
    );
    for (const node of normalizedNodes) {
      if (node.type === 'set_data') {
        this.validateFormulaAssignments(
          node,
          errors,
        );
      }
      if (
        node.type === 'condition' ||
        node.type === 'validate'
      ) {
        this.validateConditions(node, errors);
      }
    }

    const startNode = startNodes[0];
    const ir: WorkflowIrV1 | null =
      errors.length === 0 && startNode
        ? {
            irVersion: 1,
            startNodeId: startNode.id,
            nodes: normalizedNodes.map(
              (node) => ({
                id: node.id,
                type: node.type,
                version: this.registry.get(
                  node.type,
                )!.version,
                config: node.parameters ?? {},
              }),
            ),
            edges: edges.map((edge) => ({
              source: edge.source,
              target: edge.target,
              ...(edge.sourceHandle
                ? {
                    sourceHandle:
                      edge.sourceHandle as
                        | 'true'
                        | 'false',
                  }
                : {}),
              order: edge.order,
            })),
            dependencies: {
              entityIds: [...entityIds],
              fieldIds: [...fieldIds],
              integrationIds: [...integrationIds],
              httpDomains: [...httpDomains],
            },
          }
        : null;

    return {
      valid: errors.length === 0,
      ir,
      errors,
      warnings,
    };
  }

  private validateReachability(
    startId: string,
    nodes: WorkflowSourceNode[],
    edges: Array<{
      source: string;
      target: string;
    }>,
    errors: WorkflowValidationIssue[],
  ) {
    const visited = new Set<string>();
    const queue = [startId];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(
        ...edges
          .filter(
            (edge) => edge.source === current,
          )
          .map((edge) => edge.target),
      );
    }
    for (const node of nodes) {
      if (!visited.has(node.id)) {
        errors.push({
          code: 'unreachable_node',
          message: `Nodul "${node.name ?? node.id}" nu este accesibil din START.`,
          nodeId: node.id,
        });
      }
    }
  }

  private validateAcyclic(
    nodes: WorkflowSourceNode[],
    edges: Array<{
      source: string;
      target: string;
    }>,
    errors: WorkflowValidationIssue[],
  ) {
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (nodeId: string): boolean => {
      if (visiting.has(nodeId)) return false;
      if (visited.has(nodeId)) return true;
      visiting.add(nodeId);
      for (const edge of edges.filter(
        (candidate) =>
          candidate.source === nodeId,
      )) {
        if (!visit(edge.target)) return false;
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      return true;
    };
    for (const node of nodes) {
      if (!visit(node.id)) {
        errors.push({
          code: 'workflow_cycle',
          message:
            'Workflow-ul contine un ciclu. Grafurile ciclice nu sunt permise.',
          nodeId: node.id,
        });
        return;
      }
    }
  }

  private validateBeforePolicy(
    nodes: WorkflowSourceNode[],
    triggerEvents: string[],
    errors: WorkflowValidationIssue[],
  ) {
    const normalizedEvents = triggerEvents.map(
      (event) =>
        String(event).replace('entity.', ''),
    );
    const hasBefore = normalizedEvents.some(
      (event) => event.startsWith('before_'),
    );
    if (!hasBefore) return;
    const hasBeforeDelete =
      normalizedEvents.includes('before_delete');
    const hasBeforeInsert =
      normalizedEvents.includes('before_insert');
    const startNode = nodes.find((node) =>
      [
        'start',
        'trigger',
        'webhook_trigger',
      ].includes(node.type),
    );
    const startEntity = String(
      startNode?.parameters?.entity ?? '',
    );

    for (const node of nodes) {
      const definition = this.registry.get(
        node.type,
      );
      const allowed =
        definition?.beforePolicy === 'all' ||
        (!hasBeforeDelete &&
          definition?.beforePolicy ===
            'insert-update');
      if (!allowed) {
        errors.push({
          code: 'unsafe_before_node',
          message: `Nodul "${definition?.label ?? node.type}" nu este permis in before_* .`,
          nodeId: node.id,
        });
        continue;
      }
      if (node.type === 'app_update_record') {
        const params = node.parameters ?? {};
        const recordIdSource =
          params.recordIdSource ?? {};
        const hasExplicitId =
          Boolean(params.recordId) ||
          Boolean(recordIdSource.value) ||
          Boolean(recordIdSource.sourceNodeId);
        const usesCurrentRecordId =
          recordIdSource.sourceType ===
            'node_output' &&
          recordIdSource.sourceNodeId ===
            startNode?.id &&
          recordIdSource.sourceFieldSlug === 'id';
        if (
          hasExplicitId &&
          (!usesCurrentRecordId ||
            hasBeforeInsert)
        ) {
          errors.push({
            code: 'unsafe_before_update',
            message:
              hasBeforeInsert &&
              usesCurrentRecordId
                ? 'Recordul nu are ID disponibil in before_insert.'
                : 'Before_* permite numai ID-ul recordului curent primit din START.',
            nodeId: node.id,
          });
        }
        if (
          params.entity &&
          startEntity &&
          params.entity !== startEntity
        ) {
          errors.push({
            code: 'unsafe_before_update_entity',
            message:
              'Before_* permite modificarea numai a recordului curent.',
            nodeId: node.id,
          });
        }
      }
    }
  }

  private validateScheduleContext(
    nodes: WorkflowSourceNode[],
    errors: WorkflowValidationIssue[],
  ) {
    for (const node of nodes) {
      const parameters = node.parameters ?? {};
      if (node.type === 'app_update_record') {
        const source =
          parameters.recordIdSource ?? {};
        const hasExplicitRecord =
          Boolean(parameters.recordId) ||
          Boolean(source.value) ||
          Boolean(source.sourceNodeId);
        if (!hasExplicitRecord) {
          errors.push({
            code: 'schedule_record_context_required',
            message:
              'Nodul Actualizeaza Record are nevoie de un ID explicit pentru o rulare programata.',
            nodeId: node.id,
            field: 'recordIdSource',
          });
        }
      }
      if (node.type === 'app_get_related') {
        const hasExplicitRecord =
          Boolean(parameters.sourceNodeId) ||
          Boolean(parameters.relationRecordId);
        if (!hasExplicitRecord) {
          errors.push({
            code: 'schedule_record_context_required',
            message:
              'Nodul Citeste Relationat are nevoie de o sursa explicita pentru o rulare programata.',
            nodeId: node.id,
            field: 'sourceNodeId',
          });
        }
      }
    }
  }

  private validateReferences(
    nodes: WorkflowSourceNode[],
    edges: Array<{
      source: string;
      target: string;
    }>,
    errors: WorkflowValidationIssue[],
  ) {
    const nodeById = new Map(
      nodes.map((node) => [node.id, node]),
    );
    const hasPath = (
      source: string,
      target: string,
    ) => {
      const visited = new Set<string>();
      const queue = [source];
      while (queue.length) {
        const current = queue.shift()!;
        if (current === target) return true;
        if (visited.has(current)) continue;
        visited.add(current);
        queue.push(
          ...edges
            .filter(
              (edge) => edge.source === current,
            )
            .map((edge) => edge.target),
        );
      }
      return false;
    };

    for (const node of nodes) {
      const references =
        this.collectSourceNodeIds(
          node.parameters ?? {},
        );
      for (const sourceId of references) {
        if (
          sourceId === node.id ||
          !nodeById.has(sourceId) ||
          !hasPath(sourceId, node.id)
        ) {
          errors.push({
            code: 'invalid_upstream_reference',
            message: `Referinta catre nodul "${sourceId}" nu este upstream.`,
            nodeId: node.id,
          });
        }
        const source = nodeById.get(sourceId);
        if (
          source?.type === 'app_get_record' &&
          Number(source.parameters?.limit) !==
            1 &&
          node.type !== 'for_each'
        ) {
          errors.push({
            code: 'list_requires_foreach',
            message:
              'O lista nu poate fi folosita direct. Adauga nodul Pentru Fiecare.',
            nodeId: node.id,
          });
        }
      }
      if (node.type === 'for_each') {
        const sourceId = String(
          node.parameters?.sourceNodeId ?? '',
        );
        const source = nodeById.get(sourceId);
        if (source?.type !== 'app_get_record') {
          errors.push({
            code: 'invalid_foreach_source',
            message:
              'Pentru Fiecare necesita o lista din Citeste Inregistrari.',
            nodeId: node.id,
          });
        }
      }
      const definition = this.registry.get(
        node.type,
      );
      if (definition?.inputDocumentPackage) {
        const sourceId = String(
          node.parameters?.documentSourceNodeId ??
            '',
        );
        const source = nodeById.get(sourceId);
        const sourceDefinition = source
          ? this.registry.get(source.type)
          : undefined;
        if (
          !sourceDefinition ||
          sourceDefinition.documentPackage !==
            definition.inputDocumentPackage
        ) {
          errors.push({
            code: 'invalid_document_source',
            message: `Nodul necesita un document ${definition.inputDocumentPackage.toUpperCase()} upstream.`,
            nodeId: node.id,
          });
        }
      }
    }
  }

  private validateConfigConstraints(
    nodes: WorkflowSourceNode[],
    errors: WorkflowValidationIssue[],
  ) {
    for (const node of nodes) {
      const definition = this.registry.get(
        node.type,
      );
      if (!definition) continue;

      for (const field of definition.configFields) {
        const value =
          node.parameters?.[field.key];
        if (this.isMissing(value)) continue;

        if (
          field.options?.length &&
          !field.options.some(
            (option) => option.value === value,
          )
        ) {
          errors.push({
            code: 'invalid_config_option',
            message: `Valoarea campului "${field.label}" nu este valida.`,
            nodeId: node.id,
            field: field.key,
          });
        }

        if (
          !field.sourceModes?.length &&
          !field.acceptedDataTypes?.length
        ) {
          continue;
        }
        if (
          !value ||
          typeof value !== 'object' ||
          Array.isArray(value)
        ) {
          errors.push({
            code: 'invalid_value_source',
            message: `Sursa pentru "${field.label}" nu este valida.`,
            nodeId: node.id,
            field: field.key,
          });
          continue;
        }

        const source = value as Record<
          string,
          any
        >;
        if (
          field.sourceModes?.length &&
          !field.sourceModes.includes(
            source.sourceType,
          )
        ) {
          errors.push({
            code: 'invalid_source_mode',
            message: `Campul "${field.label}" trebuie sa foloseasca o valoare dintr-un nod anterior.`,
            nodeId: node.id,
            field: field.key,
          });
          continue;
        }

        if (
          field.acceptedDataTypes?.length &&
          source.sourceType === 'node_output'
        ) {
          const dataType = String(
            source.dataType ?? '',
          ).toLowerCase();
          if (!dataType) {
            errors.push({
              code: 'source_type_unknown',
              message: `Tipul campului sursa pentru "${field.label}" nu poate fi determinat.`,
              nodeId: node.id,
              field: field.key,
            });
          } else if (
            !field.acceptedDataTypes.includes(
              dataType,
            )
          ) {
            errors.push({
              code: 'source_type_mismatch',
              message: `Campul "${field.label}" accepta numai valori Date sau Datetime.`,
              nodeId: node.id,
              field: field.key,
            });
          }
        }
      }
    }
  }

  private validateConditions(
    node: WorkflowSourceNode,
    errors: WorkflowValidationIssue[],
  ) {
    const allowedByType: Record<
      string,
      Set<string>
    > = {
      string: new Set([
        'equals',
        'notEquals',
        'isNull',
        'isNotNull',
        'isEmpty',
        'isNotEmpty',
        'contains',
        'startsWith',
        'endsWith',
        'regex',
      ]),
      number: new Set([
        'equals',
        'notEquals',
        'isNull',
        'isNotNull',
        'larger',
        'smaller',
        'greaterThan',
        'lessThan',
        'largerEqual',
        'smallerEqual',
        'divisibleBy',
      ]),
      date: new Set([
        'equals',
        'notEquals',
        'isNull',
        'isNotNull',
        'after',
        'before',
        'afterEqual',
        'beforeEqual',
      ]),
      boolean: new Set([
        'equals',
        'notEquals',
        'isNull',
        'isNotNull',
        'true',
        'false',
      ]),
    };
    const unary = new Set([
      'isNull',
      'isNotNull',
      'isEmpty',
      'isNotEmpty',
      'true',
      'false',
    ]);
    for (const condition of node.parameters
      ?.conditions ?? []) {
      if (
        !condition?.leftOperand ||
        !condition?.operator ||
        (!unary.has(condition?.operator) &&
          !condition?.rightOperand)
      ) {
        errors.push({
          code: 'invalid_condition',
          message:
            'Conditia nu are ambii operanzi si operatorul configurate.',
          nodeId: node.id,
        });
        continue;
      }
      const leftType = this.typeCategory(
        condition.leftOperand.dataType,
      );
      const rightType = this.typeCategory(
        condition.rightOperand?.dataType,
      );
      if (
        leftType &&
        !allowedByType[leftType]?.has(
          condition.operator,
        )
      ) {
        errors.push({
          code: 'condition_operator_type_mismatch',
          message: `Operatorul "${condition.operator}" nu este compatibil cu tipul ${leftType}.`,
          nodeId: node.id,
        });
      }
      if (
        !unary.has(condition.operator) &&
        leftType &&
        rightType &&
        leftType !== rightType
      ) {
        errors.push({
          code: 'condition_operand_type_mismatch',
          message:
            'Operanzii conditiei au tipuri incompatibile.',
          nodeId: node.id,
        });
      }
    }
  }

  private validateFormulaAssignments(
    node: WorkflowSourceNode,
    errors: WorkflowValidationIssue[],
  ) {
    for (const assignment of node.parameters
      ?.assignments ?? []) {
      const tokens = Array.isArray(
        assignment?.tokens,
      )
        ? assignment.tokens
        : [];
      if (!assignment?.key || !tokens.length) {
        errors.push({
          code: 'invalid_formula',
          message:
            'Fiecare formula trebuie sa aiba un camp si o expresie.',
          nodeId: node.id,
        });
        continue;
      }
      let balance = 0;
      let expectsOperand = true;
      let invalidSequence = false;
      let requiresNumeric = false;
      let hasNonNumericOperand = false;
      for (const token of tokens) {
        if (token?.type === 'group_start') {
          if (!expectsOperand)
            invalidSequence = true;
          balance += 1;
          expectsOperand = true;
        } else if (token?.type === 'group_end') {
          if (expectsOperand)
            invalidSequence = true;
          balance -= 1;
          expectsOperand = false;
        } else if (token?.type === 'operator') {
          if (expectsOperand)
            invalidSequence = true;
          expectsOperand = true;
          if (
            ['-', '*', '/'].includes(token.value)
          ) {
            requiresNumeric = true;
          }
        } else if (
          token?.type === 'field' ||
          token?.type === 'literal'
        ) {
          if (!expectsOperand)
            invalidSequence = true;
          expectsOperand = false;
          const category = this.typeCategory(
            token.dataType,
          );
          if (
            category &&
            category !== 'number' &&
            token.type === 'field'
          ) {
            hasNonNumericOperand = true;
          }
          if (
            token.type === 'literal' &&
            !/^-?\d+(\.\d+)?$/.test(
              String(token.value ?? '').trim(),
            )
          ) {
            hasNonNumericOperand = true;
          }
        } else {
          invalidSequence = true;
        }
        if (
          token?.type === 'operator' &&
          !['+', '-', '*', '/'].includes(
            token.value,
          )
        ) {
          errors.push({
            code: 'invalid_formula_operator',
            message: `Operatorul "${String(token.value)}" nu este permis.`,
            nodeId: node.id,
          });
        }
        if (balance < 0) break;
      }
      if (expectsOperand || invalidSequence) {
        errors.push({
          code: 'invalid_formula_sequence',
          message:
            'Formula are operanzi sau operatori intr-o ordine invalida.',
          nodeId: node.id,
        });
      }
      if (balance !== 0) {
        errors.push({
          code: 'invalid_formula_parentheses',
          message:
            'Parantezele formulei nu sunt echilibrate.',
          nodeId: node.id,
        });
      }
      if (
        requiresNumeric &&
        hasNonNumericOperand
      ) {
        errors.push({
          code: 'formula_type_mismatch',
          message:
            'Operatorii -, * si / accepta numai operanzi numerici.',
          nodeId: node.id,
        });
      }
    }
  }

  private typeCategory(
    value: unknown,
  ): string | null {
    switch (String(value ?? '').toLowerCase()) {
      case 'integer':
      case 'numeric':
      case 'number':
        return 'number';
      case 'boolean':
        return 'boolean';
      case 'date':
      case 'datetime':
      case 'timestamp':
        return 'date';
      case 'varchar':
      case 'text':
      case 'uuid':
      case 'string':
        return 'string';
      default:
        return null;
    }
  }

  private async resolveDependencies(
    nodes: WorkflowSourceNode[],
    entityIds: Set<string>,
    fieldIds: Set<string>,
    integrationIds: Set<string>,
    httpDomains: Set<string>,
    errors: WorkflowValidationIssue[],
    edges: Array<{
      source: string;
      target: string;
    }> = [],
  ) {
    const entities = await this.knex(
      'entity',
    ).select('id_entity', 'slug');
    const entityBySlug = new Map(
      entities.map((entity) => [
        entity.slug,
        entity.id_entity,
      ]),
    );

    for (const node of nodes) {
      const slugs = new Set<string>();
      if (node.parameters?.entity)
        slugs.add(String(node.parameters.entity));
      if (node.parameters?.relationEntitySlug) {
        slugs.add(
          String(
            node.parameters.relationEntitySlug,
          ),
        );
      }
      if (node.parameters?.targetEntitySlug) {
        slugs.add(
          String(
            node.parameters.targetEntitySlug,
          ),
        );
      }
      for (const slug of slugs) {
        const entityId = entityBySlug.get(slug);
        if (!entityId) {
          errors.push({
            code: 'entity_not_found',
            message: `Entitatea "${slug}" nu exista.`,
            nodeId: node.id,
          });
        } else {
          entityIds.add(entityId);
          node.parameters ??= {};
          if (node.parameters.entity === slug) {
            node.parameters.entityId = entityId;
            node.parameters.entitySlugSnapshot =
              slug;
          }
          if (
            node.parameters.relationEntitySlug ===
            slug
          ) {
            node.parameters.relationEntityId =
              entityId;
            node.parameters.relationEntitySlugSnapshot =
              slug;
          }
          if (
            node.parameters.targetEntitySlug ===
            slug
          ) {
            node.parameters.targetEntityId =
              entityId;
            node.parameters.targetEntitySlugSnapshot =
              slug;
          }
        }
      }

      if (node.type === 'app_get_related') {
        const parameters = (node.parameters ??=
          {});
        const source = nodes.find(
          (candidate) =>
            candidate.id ===
            parameters.sourceNodeId,
        );
        const sourceEntityId = entityBySlug.get(
          String(
            source?.parameters?.entity ?? '',
          ),
        );
        const relationKey = String(
          parameters.relationField ?? '',
        );
        const relationField =
          sourceEntityId && relationKey
            ? await this.knex('field')
                .where(
                  'id_entity',
                  sourceEntityId,
                )
                .andWhere((builder) =>
                  builder
                    .where('slug', relationKey)
                    .orWhere(
                      'column_name',
                      relationKey,
                    ),
                )
                .first()
            : null;
        if (!relationField) {
          errors.push({
            code: 'relation_field_not_found',
            message:
              'Campul relatie configurat nu exista.',
            nodeId: node.id,
          });
        } else {
          fieldIds.add(relationField.id_field);
          parameters.relationFieldId =
            relationField.id_field;
          parameters.relationFieldColumn =
            relationField.column_name;
        }
      }

      if (node.type === 'email') {
        const integrationId = String(
          node.parameters?.integrationId ?? '',
        );
        const integration = integrationId
          ? await this.knex(
              'integration_definition',
            )
              .where({
                id_integration: integrationId,
                type: 'smtp',
                is_active: true,
              })
              .whereNull('date_deleted')
              .first()
          : null;
        if (!integration) {
          errors.push({
            code: 'integration_not_found',
            message:
              'Integrarea SMTP nu exista sau este inactiva.',
            nodeId: node.id,
          });
        } else {
          integrationIds.add(integrationId);
        }
      }

      if (node.type === 'http_request') {
        let url: URL | null = null;
        try {
          url = new URL(
            String(node.parameters?.url ?? ''),
          );
        } catch {
          errors.push({
            code: 'invalid_http_url',
            message:
              'URL-ul nodului HTTP nu este valid.',
            nodeId: node.id,
          });
        }
        if (url) {
          if (
            !['http:', 'https:'].includes(
              url.protocol,
            ) ||
            url.username ||
            url.password
          ) {
            errors.push({
              code: 'invalid_http_url',
              message:
                'Nodul HTTP permite numai HTTP/HTTPS fara credențiale in URL.',
              nodeId: node.id,
            });
          } else if (
            !(await this.httpDomains.findAllowed(
              url,
            ))
          ) {
            errors.push({
              code: 'http_domain_not_allowed',
              message: `Domeniul "${url.hostname}" nu este aprobat.`,
              nodeId: node.id,
            });
          } else {
            httpDomains.add(
              url.hostname.toLowerCase(),
            );
          }
        }
      }

      await this.resolveFieldDependencies(
        node,
        entityBySlug,
        fieldIds,
        errors,
      );
    }
    await this.resolveSourceFieldDependencies(
      nodes,
      entityBySlug,
      fieldIds,
      errors,
      edges,
    );
  }

  private async resolveSourceFieldDependencies(
    nodes: WorkflowSourceNode[],
    entityBySlug: Map<string, string>,
    fieldIds: Set<string>,
    errors: WorkflowValidationIssue[],
    edges: Array<{
      source: string;
      target: string;
    }> = [],
  ) {
    const nodeById = new Map(
      nodes.map((node) => [node.id, node]),
    );
    const sourceEntitySlugFor = (
      source: WorkflowSourceNode | undefined,
      visited = new Set<string>(),
    ): string => {
      if (!source || visited.has(source.id))
        return '';
      visited.add(source.id);

      if (source.type === 'app_get_related') {
        return String(
          source.parameters
            ?.relationEntitySlug ?? '',
        );
      }
      if (source.parameters?.entity) {
        return String(source.parameters.entity);
      }
      if (source.type === 'for_each') {
        return sourceEntitySlugFor(
          nodeById.get(
            String(
              source.parameters?.sourceNodeId ??
                '',
            ),
          ),
          visited,
        );
      }
      if (
        source.type === 'set_data' ||
        source.type === 'app_update_record'
      ) {
        const incoming = edges.find(
          (edge) => edge.target === source.id,
        );
        return sourceEntitySlugFor(
          incoming
            ? nodeById.get(incoming.source)
            : undefined,
          visited,
        );
      }
      return '';
    };
    const fieldsByEntity = new Map<
      string,
      Map<
        string,
        {
          id?: string;
          dataType: string;
          system?: boolean;
        }
      >
    >();
    const fieldsFor = async (
      entityId: string,
    ) => {
      const cached = fieldsByEntity.get(entityId);
      if (cached) return cached;
      const fields = await this.knex('field')
        .select(
          'id_field',
          'slug',
          'column_name',
          'data_type',
        )
        .where('id_entity', entityId);
      const map = new Map<
        string,
        {
          id?: string;
          dataType: string;
          system?: boolean;
        }
      >();
      for (const [
        key,
        descriptor,
      ] of SYSTEM_SOURCE_FIELDS) {
        map.set(key, {
          ...descriptor,
          system: true,
        });
      }
      for (const field of fields) {
        const descriptor = {
          id: field.id_field,
          dataType: field.data_type,
        };
        map.set(field.slug, descriptor);
        map.set(field.column_name, descriptor);
      }
      fieldsByEntity.set(entityId, map);
      return map;
    };

    for (const node of nodes) {
      const visit = async (
        value: unknown,
      ): Promise<void> => {
        if (!value || typeof value !== 'object')
          return;
        if (Array.isArray(value)) {
          for (const item of value)
            await visit(item);
          return;
        }
        const reference = value as Record<
          string,
          any
        >;
        if (
          typeof reference.sourceNodeId ===
          'string'
        ) {
          const source = nodeById.get(
            reference.sourceNodeId,
          );
          const sourceEntitySlug =
            sourceEntitySlugFor(source);
          const fieldKey = String(
            reference.sourceFieldSlug ??
              reference.fieldSlug ??
              reference.columnName ??
              '',
          );
          const entityId = entityBySlug.get(
            sourceEntitySlug,
          );
          if (entityId && fieldKey) {
            const field = (
              await fieldsFor(entityId)
            ).get(fieldKey);
            if (!field) {
              errors.push({
                code: 'source_field_not_found',
                message: `Campul sursa "${fieldKey}" nu exista.`,
                nodeId: node.id,
              });
            } else {
              if (field.id) {
                fieldIds.add(field.id);
                reference.sourceFieldId =
                  field.id;
              }
              reference.sourceFieldSnapshot =
                fieldKey;
              reference.dataType = field.dataType;
            }
          } else if (source && fieldKey) {
            const sourceDefinition =
              this.registry.get(source.type);
            const outputFields =
              sourceDefinition?.outputFields;
            if (outputFields) {
              const outputField =
                outputFields.find(
                  (field) =>
                    field.key === fieldKey,
                );
              if (!outputField) {
                errors.push({
                  code: 'source_field_not_found',
                  message: `Campul sursa "${fieldKey}" nu exista.`,
                  nodeId: node.id,
                });
              } else {
                reference.sourceFieldSnapshot =
                  fieldKey;
                reference.dataType =
                  outputField.dataType;
              }
            }
          }
        }
        for (const child of Object.values(
          reference,
        )) {
          await visit(child);
        }
      };
      await visit(node.parameters ?? {});
    }
  }

  private async resolveFieldDependencies(
    node: WorkflowSourceNode,
    entityBySlug: Map<string, string>,
    fieldIds: Set<string>,
    errors: WorkflowValidationIssue[],
  ) {
    const targetSlug = String(
      node.parameters?.entity ?? '',
    );
    const targetEntityId =
      entityBySlug.get(targetSlug);
    if (!targetEntityId) return;
    const fields = await this.knex('field')
      .select('id_field', 'slug', 'column_name')
      .where('id_entity', targetEntityId);
    const fieldByKey = new Map<string, string>();
    for (const field of fields) {
      fieldByKey.set(field.slug, field.id_field);
      fieldByKey.set(
        field.column_name,
        field.id_field,
      );
    }
    const referenced = new Map<
      string,
      { write: boolean; filter: boolean }
    >();
    const markReference = (
      key: string,
      kind: 'write' | 'filter',
    ) => {
      const usage = referenced.get(key) ?? {
        write: false,
        filter: false,
      };
      usage[kind] = true;
      referenced.set(key, usage);
    };
    for (const mapping of node.parameters
      ?.fieldMappings ?? []) {
      if (mapping?.key)
        markReference(
          String(mapping.key),
          'write',
        );
    }
    for (const key of Object.keys(
      node.parameters?.fields ?? {},
    )) {
      markReference(key, 'write');
    }
    for (const filter of node.parameters
      ?.filters ?? []) {
      if (filter?.field)
        markReference(
          String(filter.field),
          'filter',
        );
    }
    for (const [key, usage] of referenced) {
      const id = fieldByKey.get(key);
      const systemField =
        SYSTEM_SOURCE_FIELDS.get(key);
      const validSystemFilter =
        usage.filter &&
        !usage.write &&
        Boolean(systemField);
      if (!id && !validSystemFilter) {
        errors.push({
          code: 'field_not_found',
          message: `Campul "${key}" nu exista in entitatea "${targetSlug}".`,
          nodeId: node.id,
        });
      } else if (!id && systemField) {
        for (const filter of node.parameters
          ?.filters ?? []) {
          if (filter?.field === key) {
            filter.fieldSnapshot = key;
            filter.dataType =
              systemField.dataType;
          }
        }
      } else {
        if (!id) continue;
        fieldIds.add(id);
        node.parameters ??= {};
        node.parameters.fieldRefs ??= {};
        node.parameters.fieldRefs[key] = {
          fieldId: id,
          fieldSnapshot: key,
        };
        for (const mapping of node.parameters
          .fieldMappings ?? []) {
          if (mapping?.key === key) {
            mapping.fieldId = id;
            mapping.fieldSnapshot = key;
          }
        }
        for (const filter of node.parameters
          .filters ?? []) {
          if (filter?.field === key) {
            filter.fieldId = id;
            filter.fieldSnapshot = key;
          }
        }
      }
    }
  }

  private collectSourceNodeIds(
    value: unknown,
  ): Set<string> {
    const result = new Set<string>();
    const visit = (candidate: unknown) => {
      if (
        !candidate ||
        typeof candidate !== 'object'
      )
        return;
      if (Array.isArray(candidate)) {
        candidate.forEach(visit);
        return;
      }
      const record = candidate as Record<
        string,
        unknown
      >;
      if (
        typeof record.sourceNodeId === 'string' &&
        record.sourceNodeId.length > 0
      ) {
        result.add(record.sourceNodeId);
      }
      if (
        typeof record.documentSourceNodeId ===
          'string' &&
        record.documentSourceNodeId.length > 0
      ) {
        result.add(record.documentSourceNodeId);
      }
      Object.values(record).forEach(visit);
    };
    visit(value);
    return result;
  }

  private async linkedTriggerEvents(
    workflowId: string,
  ): Promise<string[]> {
    const actions = await this.knex(
      'action_definition',
    )
      .where({
        id_workflow: workflowId,
        is_active: true,
      })
      .select('trigger_events');
    return actions.flatMap((action) =>
      this.parseArray(action.trigger_events),
    );
  }

  private parseArray(value: unknown): string[] {
    if (Array.isArray(value))
      return value.map(String);
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.map(String)
        : [];
    } catch {
      return [];
    }
  }

  private isMissing(value: unknown): boolean {
    if (value === undefined || value === null)
      return true;
    if (typeof value === 'string')
      return value.trim() === '';
    if (Array.isArray(value))
      return value.length === 0;
    if (typeof value === 'object') {
      const record = value as Record<
        string,
        unknown
      >;
      if (record.sourceType === 'static') {
        return (
          String(record.value ?? '').trim() === ''
        );
      }
      if (record.sourceType === 'node_output') {
        return (
          !record.sourceNodeId ||
          !record.sourceFieldSlug
        );
      }
      return Object.keys(record).length === 0;
    }
    return false;
  }
}
