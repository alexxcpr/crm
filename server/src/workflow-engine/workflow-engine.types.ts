import type { AuthenticatedUser } from 'src/security/security.types';

export type WorkflowTriggerType =
  | 'manual'
  | 'entity.before_insert'
  | 'entity.before_update'
  | 'entity.before_delete'
  | 'entity.after_insert'
  | 'entity.after_update'
  | 'entity.after_delete';

export interface WorkflowSourceNode {
  id: string;
  type: string;
  position?: { x: number; y: number };
  parameters?: Record<string, any>;
  name?: string;
}

export interface WorkflowSourceConnection {
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowIrNode {
  id: string;
  type: string;
  version: number;
  config: Record<string, any>;
}

export interface WorkflowIrEdge {
  source: string;
  target: string;
  sourceHandle?: 'true' | 'false';
  order: number;
}

export interface WorkflowIrV1 {
  irVersion: 1;
  startNodeId: string;
  nodes: WorkflowIrNode[];
  edges: WorkflowIrEdge[];
  dependencies: {
    entityIds: string[];
    fieldIds: string[];
    integrationIds: string[];
    httpDomains: string[];
  };
}

export interface WorkflowValidationIssue {
  code: string;
  message: string;
  nodeId?: string;
  field?: string;
}

export interface WorkflowCompilationResult {
  valid: boolean;
  ir: WorkflowIrV1 | null;
  errors: WorkflowValidationIssue[];
  warnings: WorkflowValidationIssue[];
}

export interface WorkflowNodeConfigField {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  placeholder?: string;
  inputKind?: string;
  options?: Array<{
    label: string;
    value: string;
  }>;
}

export interface WorkflowNodeDefinition {
  type: string;
  version: number;
  label: string;
  icon: string;
  color: string;
  category:
    | 'trigger'
    | 'system'
    | 'action'
    | 'logic'
    | 'integration'
    | 'files';
  description: string;
  defaults: Record<string, any>;
  configFields: WorkflowNodeConfigField[];
  beforePolicy: 'all' | 'insert-update' | 'none';
  outputKind?:
    | 'record'
    | 'list'
    | 'value'
    | 'document';
  documentPackage?: 'word' | 'pdf';
  inputDocumentPackage?: 'word' | 'pdf';
}

export interface WorkflowExecutionInput {
  trigger: WorkflowTriggerType;
  triggerName?: string;
  entitySlug?: string;
  entityId?: string;
  recordId?: string | null;
  record?: Record<string, any>;
  previousData?: Record<string, any>;
  actor: AuthenticatedUser;
  parentExecutionId?: string | null;
  depth?: number;
}

export interface WorkflowRuntimeResult {
  executionId: string;
  status: 'completed' | 'failed';
  output: Record<string, any>;
}

export interface WorkflowExecutionContext extends WorkflowExecutionInput {
  executionId: string;
  workflowId: string;
  revisionId: string;
  deadlineAt: number;
  signal: AbortSignal;
  nodeRunCount: number;
  outputs: Map<string, NodeOutput[]>;
}

export interface NodeOutput {
  nodeId: string;
  runIndex: number;
  itemIndex: number;
  value: any;
}

export interface WorkflowExecutionToken {
  itemIndex: number;
  current: Record<string, any>;
  sourceNodeId?: string;
}
