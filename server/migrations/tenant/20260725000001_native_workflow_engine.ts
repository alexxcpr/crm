import type { Knex } from 'knex';

const SUPPORTED_NODE_TYPES = new Set([
  'start',
  'trigger',
  'webhook_trigger',
  'system_get_current_profile',
  'app_get_record',
  'app_get_related',
  'app_create_record',
  'app_update_record',
  'email',
  'condition',
  'word_open',
  'word_replace_text',
  'word_create_table_rows',
  'word_insert_table_rows',
  'word_convert_to_pdf',
  'word_save',
  'word_update',
  'pdf_open',
  'pdf_save',
  'pdf_update',
  'notification',
  'for_each',
  'validate',
  'stop_error',
  'http_request',
  'set_data',
]);

const BEFORE_SAFE_NODE_TYPES = new Set([
  'start',
  'trigger',
  'webhook_trigger',
  'system_get_current_profile',
  'app_get_record',
  'app_get_related',
  'condition',
  'validate',
  'stop_error',
  'set_data',
  'app_update_record',
]);

const BEFORE_DELETE_SAFE_NODE_TYPES = new Set([
  'start',
  'trigger',
  'webhook_trigger',
  'system_get_current_profile',
  'app_get_record',
  'app_get_related',
  'condition',
  'validate',
  'stop_error',
]);

const REQUIRED_CONFIG: Record<string, string[]> =
  {
    start: ['entity'],
    trigger: ['entity'],
    webhook_trigger: ['entity'],
    app_get_record: ['entity'],
    app_get_related: [
      'sourceNodeId',
      'relationField',
    ],
    app_create_record: ['entity'],
    app_update_record: ['entity'],
    email: [
      'integrationId',
      'to',
      'subject',
      'content',
    ],
    notification: [
      'recipient',
      'subjectTokens',
      'contentTokens',
    ],
    for_each: ['sourceNodeId'],
    validate: ['conditions', 'message'],
    stop_error: ['message'],
    http_request: ['url'],
    word_open: ['fileId'],
    word_replace_text: [
      'documentSourceNodeId',
      'search',
      'replace',
    ],
    word_create_table_rows: [
      'documentSourceNodeId',
      'search',
      'nrOfNewRows',
    ],
    word_insert_table_rows: [
      'documentSourceNodeId',
      'search',
      'nrOfNewRows',
    ],
    word_convert_to_pdf: ['documentSourceNodeId'],
    word_save: [
      'documentSourceNodeId',
      'fileName',
    ],
    word_update: [
      'documentSourceNodeId',
      'fileId',
    ],
    pdf_open: ['fileId'],
    pdf_save: ['documentSourceNodeId'],
    pdf_update: [
      'documentSourceNodeId',
      'fileId',
    ],
  };

function isMissing(value: unknown): boolean {
  if (value === null || value === undefined)
    return true;
  if (typeof value === 'string')
    return value.trim() === '';
  if (Array.isArray(value))
    return value.length === 0;
  if (typeof value === 'object') {
    const record = value as Record<string, any>;
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
  }
  return false;
}

function collectSourceNodeIds(
  value: unknown,
): string[] {
  const ids = new Set<string>();
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
    for (const key of [
      'sourceNodeId',
      'documentSourceNodeId',
    ]) {
      if (
        typeof record[key] === 'string' &&
        record[key]
      ) {
        ids.add(record[key] as string);
      }
    }
    Object.values(record).forEach(visit);
  };
  visit(value);
  return [...ids];
}

function parseJsonArray(value: unknown): any[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function migrationErrors(
  nodes: any[],
  connections: any[],
  beforeEvents: string[],
): Array<{
  code: string;
  message: string;
  nodeId?: string;
}> {
  const errors: Array<{
    code: string;
    message: string;
    nodeId?: string;
  }> = [];
  const normalizedTypes = nodes.map((node) =>
    ['trigger', 'webhook_trigger'].includes(
      node?.type,
    )
      ? 'start'
      : node?.type,
  );
  const starts = normalizedTypes.filter(
    (type) => type === 'start',
  );
  const normalizedNodes = nodes.map((node) => ({
    ...node,
    type: ['trigger', 'webhook_trigger'].includes(
      node?.type,
    )
      ? 'start'
      : node?.type,
  }));

  if (starts.length !== 1) {
    errors.push({
      code: 'invalid_start_count',
      message:
        'Workflow-ul trebuie sa aiba exact un nod START.',
    });
  }

  for (const node of nodes) {
    if (node?.type === 'delay') {
      errors.push({
        code: 'unsupported_delay',
        message:
          'Nodul Delay nu mai este suportat.',
        nodeId: node.id,
      });
      continue;
    }
    if (node?.type === 'code') {
      errors.push({
        code: 'unsupported_code',
        message:
          'Nodul Cod Custom nu este disponibil in engine-ul nativ v1.',
        nodeId: node.id,
      });
      continue;
    }
    if (node?.type === 'http_request') {
      errors.push({
        code: 'http_domain_not_allowed',
        message:
          'Domeniul HTTP trebuie aprobat dupa expand si workflow-ul recompilat.',
        nodeId: node.id,
      });
      continue;
    }
    if (!SUPPORTED_NODE_TYPES.has(node?.type)) {
      errors.push({
        code: 'unknown_node_type',
        message: `Tipul de nod "${String(node?.type ?? '')}" nu este suportat.`,
        nodeId: node?.id,
      });
    }
    for (const key of REQUIRED_CONFIG[
      node?.type
    ] ?? []) {
      if (isMissing(node?.parameters?.[key])) {
        errors.push({
          code: 'required_config_missing',
          message: `Configuratia "${key}" este obligatorie.`,
          nodeId: node?.id,
        });
      }
    }
  }

  if (beforeEvents.length > 0) {
    const normalizedBeforeEvents =
      beforeEvents.map((event) =>
        String(event).replace('entity.', ''),
      );
    const hasBeforeDelete = beforeEvents.some(
      (event) =>
        String(event).replace('entity.', '') ===
        'before_delete',
    );
    const hasBeforeInsert =
      normalizedBeforeEvents.includes(
        'before_insert',
      );
    const startNode = normalizedNodes.find(
      (node) => node?.type === 'start',
    );
    const allowedTypes = hasBeforeDelete
      ? BEFORE_DELETE_SAFE_NODE_TYPES
      : BEFORE_SAFE_NODE_TYPES;
    for (const node of nodes) {
      if (!allowedTypes.has(node?.type)) {
        errors.push({
          code: 'unsafe_before_node',
          message: `Nodul "${String(node?.type ?? '')}" nu este permis pentru trigger-ele before_* .`,
          nodeId: node?.id,
        });
        continue;
      }
      if (node?.type === 'app_update_record') {
        const parameters = node.parameters ?? {};
        const recordIdSource =
          parameters.recordIdSource ?? {};
        const hasRecordId =
          Boolean(parameters.recordId) ||
          Boolean(recordIdSource.value) ||
          Boolean(recordIdSource.sourceNodeId);
        const usesCurrentRecordId =
          recordIdSource.sourceType ===
            'node_output' &&
          recordIdSource.sourceNodeId ===
            startNode?.id &&
          recordIdSource.sourceFieldSlug === 'id';
        if (
          hasRecordId &&
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
      }
    }
  }

  const nodeIds = new Set(
    nodes.map((node) => node?.id).filter(Boolean),
  );
  if (nodeIds.size !== nodes.length) {
    errors.push({
      code: 'duplicate_node_id',
      message:
        'Workflow-ul contine ID-uri de nod duplicate sau lipsa.',
    });
  }
  for (const connection of connections) {
    if (
      !nodeIds.has(connection?.source) ||
      !nodeIds.has(connection?.target)
    ) {
      errors.push({
        code: 'invalid_connection',
        message:
          'Workflow-ul contine o conexiune catre un nod inexistent.',
      });
    }
    const source = normalizedNodes.find(
      (node) => node.id === connection?.source,
    );
    if (
      source?.type === 'condition' &&
      !['true', 'false'].includes(
        connection?.sourceHandle,
      )
    ) {
      errors.push({
        code: 'invalid_condition_handle',
        message:
          'Conexiunile conditiei trebuie sa foloseasca true sau false.',
        nodeId: source.id,
      });
    }
  }

  const startNode = normalizedNodes.find(
    (node) => node.type === 'start',
  );
  if (startNode) {
    const visited = new Set<string>();
    const queue = [startNode.id];
    while (queue.length) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      queue.push(
        ...connections
          .filter(
            (edge) => edge.source === current,
          )
          .map((edge) => edge.target),
      );
    }
    for (const node of normalizedNodes) {
      if (!visited.has(node.id)) {
        errors.push({
          code: 'unreachable_node',
          message:
            'Workflow-ul contine un nod inaccesibil din START.',
          nodeId: node.id,
        });
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const acyclic = (nodeId: string): boolean => {
    if (visiting.has(nodeId)) return false;
    if (visited.has(nodeId)) return true;
    visiting.add(nodeId);
    for (const edge of connections.filter(
      (item) => item.source === nodeId,
    )) {
      if (!acyclic(edge.target)) return false;
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    return true;
  };
  if (
    normalizedNodes.some(
      (node) => !acyclic(node.id),
    )
  ) {
    errors.push({
      code: 'workflow_cycle',
      message: 'Workflow-ul contine un ciclu.',
    });
  }

  const hasPath = (
    source: string,
    target: string,
  ) => {
    const seen = new Set<string>();
    const queue = [source];
    while (queue.length) {
      const current = queue.shift()!;
      if (current === target) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(
        ...connections
          .filter(
            (edge) => edge.source === current,
          )
          .map((edge) => edge.target),
      );
    }
    return false;
  };
  for (const node of normalizedNodes) {
    for (const sourceId of collectSourceNodeIds(
      node.parameters ?? {},
    )) {
      if (
        sourceId === node.id ||
        !nodeIds.has(sourceId) ||
        !hasPath(sourceId, node.id)
      ) {
        errors.push({
          code: 'invalid_upstream_reference',
          message:
            'Workflow-ul contine o referinta care nu este upstream.',
          nodeId: node.id,
        });
      }
    }
    if (node.type === 'for_each') {
      const source = normalizedNodes.find(
        (candidate) =>
          candidate.id ===
          node.parameters?.sourceNodeId,
      );
      if (source?.type !== 'app_get_record') {
        errors.push({
          code: 'invalid_foreach_source',
          message:
            'Pentru Fiecare necesita o lista din Citeste Inregistrari.',
          nodeId: node.id,
        });
      }
    }
  }

  return errors;
}

export async function up(
  knex: Knex,
): Promise<void> {
  await knex.schema.createTable(
    'workflow_http_allowed_domain',
    (table) => {
      table
        .uuid('id_domain')
        .primary()
        .defaultTo(knex.fn.uuid());
      table.string('name', 120).notNullable();
      table.string('hostname', 253).notNullable();
      table.integer('port').nullable();
      table
        .boolean('is_active')
        .notNullable()
        .defaultTo(true);
      table
        .uuid('id_created_by_profile')
        .nullable()
        .references('id_profile')
        .inTable('profile')
        .onDelete('SET NULL');
      table
        .timestamp('date_created', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('date_updated', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.unique(['hostname', 'port'], {
        indexName:
          'workflow_http_allowed_domain_host_port_unique',
      });
      table.index(
        ['is_active', 'hostname'],
        'workflow_http_allowed_domain_active_host_idx',
      );
    },
  );

  await knex.schema.createTable(
    'workflow_revision',
    (table) => {
      table
        .uuid('id_revision')
        .primary()
        .defaultTo(knex.fn.uuid());
      table
        .uuid('id_workflow')
        .notNullable()
        .references('id_workflow')
        .inTable('workflow_definition')
        .onDelete('CASCADE');
      table.integer('version').notNullable();
      table
        .jsonb('source_nodes')
        .notNullable()
        .defaultTo('[]');
      table
        .jsonb('source_connections')
        .notNullable()
        .defaultTo('[]');
      table.jsonb('compiled_ir').nullable();
      table
        .boolean('is_valid')
        .notNullable()
        .defaultTo(false);
      table
        .jsonb('validation_errors')
        .notNullable()
        .defaultTo('[]');
      table
        .uuid('id_created_by_profile')
        .nullable()
        .references('id_profile')
        .inTable('profile')
        .onDelete('SET NULL');
      table
        .timestamp('date_created', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table.unique(['id_workflow', 'version'], {
        indexName:
          'workflow_revision_workflow_version_unique',
      });
      table.index(
        ['id_workflow', 'date_created'],
        'workflow_revision_workflow_created_idx',
      );
    },
  );

  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table.uuid('latest_revision_id').nullable();
      table.uuid('active_revision_id').nullable();
    },
  );

  await knex.schema.createTable(
    'workflow_execution',
    (table) => {
      table
        .uuid('id_execution')
        .primary()
        .defaultTo(knex.fn.uuid());
      table
        .uuid('id_workflow')
        .notNullable()
        .references('id_workflow')
        .inTable('workflow_definition')
        .onDelete('CASCADE');
      table
        .uuid('id_revision')
        .notNullable()
        .references('id_revision')
        .inTable('workflow_revision')
        .onDelete('RESTRICT');
      table
        .uuid('parent_execution_id')
        .nullable()
        .references('id_execution')
        .inTable('workflow_execution')
        .onDelete('SET NULL');
      table
        .string('trigger_type', 60)
        .notNullable();
      table
        .string('trigger_name', 160)
        .nullable();
      table.string('entity_slug', 100).nullable();
      table.uuid('record_id').nullable();
      table.uuid('id_actor_user').nullable();
      table.uuid('id_actor_profile').nullable();
      table
        .string('status', 20)
        .notNullable()
        .defaultTo('running');
      table.string('error_code', 100).nullable();
      table.text('error_message').nullable();
      table.integer('duration_ms').nullable();
      table
        .timestamp('date_started', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('date_finished', {
          useTz: true,
        })
        .nullable();
      table.index(
        ['id_workflow', 'date_started'],
        'workflow_execution_workflow_started_idx',
      );
      table.index(
        ['status', 'date_started'],
        'workflow_execution_status_started_idx',
      );
    },
  );

  await knex.raw(`
    ALTER TABLE workflow_execution
      ADD CONSTRAINT workflow_execution_status_check
      CHECK (status IN ('running', 'completed', 'failed'))
  `);

  await knex.schema.createTable(
    'workflow_node_run',
    (table) => {
      table
        .uuid('id_node_run')
        .primary()
        .defaultTo(knex.fn.uuid());
      table
        .uuid('id_execution')
        .notNullable()
        .references('id_execution')
        .inTable('workflow_execution')
        .onDelete('CASCADE');
      table.string('node_id', 200).notNullable();
      table
        .string('node_type', 100)
        .notNullable();
      table
        .integer('run_index')
        .notNullable()
        .defaultTo(0);
      table
        .integer('item_index')
        .notNullable()
        .defaultTo(0);
      table
        .string('status', 20)
        .notNullable()
        .defaultTo('running');
      table.jsonb('input_snapshot').nullable();
      table.jsonb('output_snapshot').nullable();
      table.string('error_code', 100).nullable();
      table.text('error_message').nullable();
      table.integer('duration_ms').nullable();
      table
        .timestamp('date_started', {
          useTz: true,
        })
        .notNullable()
        .defaultTo(knex.fn.now());
      table
        .timestamp('date_finished', {
          useTz: true,
        })
        .nullable();
      table.unique(
        [
          'id_execution',
          'node_id',
          'run_index',
          'item_index',
        ],
        {
          indexName:
            'workflow_node_run_execution_node_item_unique',
        },
      );
      table.index(
        ['id_execution', 'date_started'],
        'workflow_node_run_execution_started_idx',
      );
    },
  );

  await knex.raw(`
    ALTER TABLE workflow_node_run
      ADD CONSTRAINT workflow_node_run_status_check
      CHECK (status IN ('running', 'completed', 'failed'))
  `);

  const workflows = await knex(
    'workflow_definition',
  ).select('*');
  for (const workflow of workflows) {
    const sourceNodes = parseJsonArray(
      workflow.nodes,
    );
    const sourceConnections = parseJsonArray(
      workflow.connections,
    );
    const beforeActions = await knex(
      'action_definition',
    )
      .where('id_workflow', workflow.id_workflow)
      .select('trigger_events');
    const beforeEvents = beforeActions.flatMap(
      (action) =>
        parseJsonArray(
          action.trigger_events,
        ).filter((event) =>
          String(event)
            .replace('entity.', '')
            .startsWith('before_'),
        ),
    );
    const errors = migrationErrors(
      sourceNodes,
      sourceConnections,
      beforeEvents,
    );
    const normalizedSourceNodes = sourceNodes.map(
      (node) => ({
        ...node,
        type: [
          'trigger',
          'webhook_trigger',
        ].includes(node.type)
          ? 'start'
          : node.type,
      }),
    );
    const normalizedNodes =
      normalizedSourceNodes.map((node) => ({
        id: node.id,
        type: node.type,
        version: 1,
        config: node.parameters ?? {},
      }));
    const startNode = normalizedNodes.find(
      (node) => node.type === 'start',
    );
    const compiledIr =
      errors.length === 0 && startNode
        ? {
            irVersion: 1,
            startNodeId: startNode.id,
            nodes: normalizedNodes,
            edges: sourceConnections.map(
              (connection, order) => ({
                source: connection.source,
                target: connection.target,
                ...(connection.sourceHandle
                  ? {
                      sourceHandle:
                        connection.sourceHandle,
                    }
                  : {}),
                order,
              }),
            ),
            dependencies: {
              entityIds: [],
              fieldIds: [],
              integrationIds: [],
              httpDomains: [],
            },
          }
        : null;

    const [revision] = await knex(
      'workflow_revision',
    )
      .insert({
        id_workflow: workflow.id_workflow,
        version: 1,
        source_nodes: JSON.stringify(
          normalizedSourceNodes,
        ),
        source_connections: JSON.stringify(
          sourceConnections,
        ),
        compiled_ir: compiledIr
          ? JSON.stringify(compiledIr)
          : null,
        is_valid: errors.length === 0,
        validation_errors: JSON.stringify(errors),
      })
      .returning('id_revision');

    await knex('workflow_definition')
      .where('id_workflow', workflow.id_workflow)
      .update({
        latest_revision_id: revision.id_revision,
        version: 1,
        active_revision_id:
          workflow.status === 'active' &&
          errors.length === 0
            ? revision.id_revision
            : null,
        status:
          workflow.status === 'active' &&
          errors.length > 0
            ? 'paused'
            : workflow.status,
      });
  }

  await knex.raw(`
    ALTER TABLE workflow_definition
      ADD CONSTRAINT workflow_definition_latest_revision_fk
      FOREIGN KEY (latest_revision_id)
      REFERENCES workflow_revision(id_revision)
      ON DELETE SET NULL
  `);
  await knex.raw(`
    ALTER TABLE workflow_definition
      ADD CONSTRAINT workflow_definition_active_revision_fk
      FOREIGN KEY (active_revision_id)
      REFERENCES workflow_revision(id_revision)
      ON DELETE SET NULL
  `);

  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table.dropColumn('nodes');
      table.dropColumn('connections');
      table.dropColumn('n8n_workflow_id');
    },
  );
}

export async function down(
  knex: Knex,
): Promise<void> {
  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table
        .jsonb('nodes')
        .notNullable()
        .defaultTo('[]');
      table
        .jsonb('connections')
        .notNullable()
        .defaultTo('[]');
      table
        .string('n8n_workflow_id', 100)
        .nullable();
    },
  );

  const definitions = await knex(
    'workflow_definition',
  ).select('id_workflow', 'latest_revision_id');
  for (const definition of definitions) {
    if (!definition.latest_revision_id) continue;
    const revision = await knex(
      'workflow_revision',
    )
      .where(
        'id_revision',
        definition.latest_revision_id,
      )
      .first();
    if (!revision) continue;
    await knex('workflow_definition')
      .where(
        'id_workflow',
        definition.id_workflow,
      )
      .update({
        nodes: revision.source_nodes,
        connections: revision.source_connections,
      });
  }

  await knex.raw(`
    ALTER TABLE workflow_definition
      DROP CONSTRAINT IF EXISTS workflow_definition_active_revision_fk
  `);
  await knex.raw(`
    ALTER TABLE workflow_definition
      DROP CONSTRAINT IF EXISTS workflow_definition_latest_revision_fk
  `);
  await knex.schema.alterTable(
    'workflow_definition',
    (table) => {
      table.dropColumn('active_revision_id');
      table.dropColumn('latest_revision_id');
    },
  );
  await knex.schema.dropTableIfExists(
    'workflow_node_run',
  );
  await knex.schema.dropTableIfExists(
    'workflow_execution',
  );
  await knex.schema.dropTableIfExists(
    'workflow_revision',
  );
  await knex.schema.dropTableIfExists(
    'workflow_http_allowed_domain',
  );
}
