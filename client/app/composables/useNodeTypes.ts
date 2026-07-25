export type FieldValueSource =
  | "static"
  | "current_record"
  | "previous_node"
  | "relation"
  | "node_output";

export interface FormulaToken {
  type: "field" | "literal" | "operator" | "group_start" | "group_end";
  sourceNodeId?: string;
  fieldSlug?: string;
  fieldLabel?: string;
  sourceLabel?: string;
  dataType?: string;
  value?: string;
}

export interface FormulaAssignment {
  key: string;
  tokens: FormulaToken[];
}

export interface NotificationRecipient {
  sourceType: "static" | "node_output";
  profileId?: string;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
  fieldLabel?: string;
  sourceLabel?: string;
}

export interface TextTemplateToken {
  type: "literal" | "field";
  value?: string;
  sourceNodeId?: string;
  fieldSlug?: string;
  fieldLabel?: string;
  sourceLabel?: string;
}

export interface WorkflowValueSource {
  sourceType: "static" | "node_output";
  value?: string;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
  fieldLabel?: string;
  sourceLabel?: string;
}

export interface FieldMapping {
  key: string;
  sourceType: FieldValueSource;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
  value: string;
}

export interface RecordIdSource {
  sourceType: "static" | "node_output";
  value: string;
  sourceNodeId?: string;
  sourceFieldSlug?: string;
}

export interface FilterEntry {
  field: string;
  operator: string;
  valueSource: RecordIdSource;
}

export type ConditionOperandSource = "static" | "node_output";

export interface ConditionOperand {
  sourceType: ConditionOperandSource;
  sourceNodeId?: string;
  fieldSlug?: string;
  fieldLabel?: string;
  dataType?: string;
  value?: string;
}

export interface Condition {
  id: string;
  leftOperand: ConditionOperand;
  operator: string;
  rightOperand: ConditionOperand;
}

export interface OperatorDef {
  moduvisValue: string;
  label: string;
  types: string[];
  unary: boolean;
}

export const OPERATOR_DEFS: OperatorDef[] = [
  {
    moduvisValue: "equals",
    label: "Egal cu",
    types: ["string", "number", "date", "boolean"],
    unary: false,
  },
  {
    moduvisValue: "notEquals",
    label: "Diferit de",
    types: ["string", "number", "date", "boolean"],
    unary: false,
  },
  {
    moduvisValue: "isNull",
    label: "Este gol (null)",
    types: ["null"],
    unary: true,
  },
  {
    moduvisValue: "isNotNull",
    label: "Nu este gol",
    types: ["null"],
    unary: true,
  },
  {
    moduvisValue: "contains",
    label: "Contine",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "startsWith",
    label: "Incepe cu",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "endsWith",
    label: "Se termina cu",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "regex",
    label: "Regex",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "larger",
    label: "Mai mare decat",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "smaller",
    label: "Mai mic decat",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "largerEqual",
    label: "Mai mare sau egal",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "smallerEqual",
    label: "Mai mic sau egal",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "divisibleBy",
    label: "Divizibil cu",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "after",
    label: "Dupa",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "before",
    label: "Inainte de",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "afterEqual",
    label: "Dupa sau egal",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "beforeEqual",
    label: "Inainte sau egal",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "true",
    label: "Este adevarat",
    types: ["boolean"],
    unary: true,
  },
  {
    moduvisValue: "false",
    label: "Este fals",
    types: ["boolean"],
    unary: true,
  },
];

export function getOperatorsForType(dataType?: string): OperatorDef[] {
  if (!dataType) {
    return OPERATOR_DEFS.filter(
      (operator) =>
        operator.types.includes("string") ||
        operator.types.includes("null"),
    );
  }
  const allowed = new Set([dataTypeCategory(dataType), "null"]);
  return OPERATOR_DEFS.filter((operator) =>
    operator.types.some((type) => allowed.has(type)),
  );
}

export function dataTypeCategory(dataType: string): string {
  switch (dataType) {
    case "varchar":
    case "text":
    case "uuid":
      return "string";
    case "integer":
    case "numeric":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
    case "datetime":
    case "timestamp":
      return "date";
    default:
      return "string";
  }
}

export type DocumentPackage = "word" | "pdf" | "excel" | "image";

export interface NodeConfigField {
  key: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "number"
    | "boolean"
    | "entity-select"
    | "field-select"
    | "field-mappings"
    | "record-id-source"
    | "data-source-select"
    | "list-source-select"
    | "relation-field-select"
    | "formula-assignments"
    | "target-field-select"
    | "condition-editor"
    | "filter-list"
    | "notification-recipient"
    | "text-template"
    | "integration-select"
    | "workflow-value-source"
    | "document-source-select";
  placeholder?: string;
  options?: Array<{ label: string; value: string }>;
  required?: boolean;
  inputKind?: "email" | "text" | "textarea" | "file-name";
}

export interface NodeTypeDefinition {
  type: string;
  version: number;
  label: string;
  icon: string;
  category:
    | "trigger"
    | "system"
    | "action"
    | "logic"
    | "integration"
    | "files";
  package?: DocumentPackage;
  inputDocumentPackage?: DocumentPackage;
  outputDocumentPackage?: DocumentPackage;
  color: string;
  description: string;
  defaults: Record<string, any>;
  configFields: NodeConfigField[];
}

const categories = [
  { key: "trigger", label: "Triggers", icon: "i-lucide-play" },
  { key: "system", label: "Sistem", icon: "i-lucide-settings" },
  { key: "action", label: "Actiuni", icon: "i-lucide-database" },
  { key: "files", label: "Fisiere", icon: "i-lucide-folder-open" },
  { key: "logic", label: "Logica", icon: "i-lucide-git-branch" },
  { key: "integration", label: "Integratii", icon: "i-lucide-plug" },
];

export function useNodeTypes() {
  const nodeTypes = useState<NodeTypeDefinition[]>(
    "workflow-node-types",
    () => [],
  );
  const registryLoaded = useState(
    "workflow-node-types-loaded",
    () => false,
  );
  const registryLoading = useState(
    "workflow-node-types-loading",
    () => false,
  );

  async function fetchNodeTypes(force = false) {
    if ((registryLoaded.value && !force) || registryLoading.value) {
      return nodeTypes.value;
    }
    registryLoading.value = true;
    try {
      const { apiFetch } = useApi();
      const response = await apiFetch<{ data: any[] }>(
        "/v1/admin/workflow-node-types",
      );
      nodeTypes.value = (response.data ?? []).map((definition) => ({
        ...definition,
        package: definition.type.startsWith("word_")
          ? "word"
          : definition.type.startsWith("pdf_")
            ? "pdf"
            : definition.documentPackage,
        outputDocumentPackage: definition.documentPackage,
      }));
      registryLoaded.value = true;
    } finally {
      registryLoading.value = false;
    }
    return nodeTypes.value;
  }

  function getNodeType(type: string): NodeTypeDefinition | undefined {
    const normalized = ["trigger", "webhook_trigger"].includes(type)
      ? "start"
      : type;
    return nodeTypes.value.find(
      (definition) => definition.type === normalized,
    );
  }

  function getNodesByCategory(category: string): NodeTypeDefinition[] {
    return nodeTypes.value.filter(
      (definition) => definition.category === category,
    );
  }

  return {
    nodeTypes,
    categories,
    registryLoading,
    fetchNodeTypes,
    getNodeType,
    getNodesByCategory,
  };
}
