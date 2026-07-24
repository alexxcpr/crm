export type FieldValueSource =
  | "static"
  | "current_record"
  | "previous_node"
  | "relation"
  | "expression"
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

// ─── Condition / IF node types ───

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
  n8nOperation: string;
  types: string[];
  unary: boolean;
}

export const OPERATOR_DEFS: OperatorDef[] = [
  // Universali
  {
    moduvisValue: "equals",
    label: "Egal cu",
    n8nOperation: "equals",
    types: ["string", "number", "date", "boolean"],
    unary: false,
  },
  {
    moduvisValue: "notEquals",
    label: "Diferit de",
    n8nOperation: "notEquals",
    types: ["string", "number", "date", "boolean"],
    unary: false,
  },
  {
    moduvisValue: "isNull",
    label: "Este gol (null)",
    n8nOperation: "isEmpty",
    types: ["null"],
    unary: true,
  },
  {
    moduvisValue: "isNotNull",
    label: "Nu este gol",
    n8nOperation: "isNotEmpty",
    types: ["null"],
    unary: true,
  },
  // String
  {
    moduvisValue: "contains",
    label: "Contine",
    n8nOperation: "contains",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "startsWith",
    label: "Incepe cu",
    n8nOperation: "startsWith",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "endsWith",
    label: "Se termina cu",
    n8nOperation: "endsWith",
    types: ["string"],
    unary: false,
  },
  {
    moduvisValue: "regex",
    label: "Regex",
    n8nOperation: "regex",
    types: ["string"],
    unary: false,
  },
  // Number
  {
    moduvisValue: "larger",
    label: "Mai mare decat",
    n8nOperation: "larger",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "smaller",
    label: "Mai mic decat",
    n8nOperation: "smaller",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "largerEqual",
    label: "Mai mare sau egal",
    n8nOperation: "largerEqual",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "smallerEqual",
    label: "Mai mic sau egal",
    n8nOperation: "smallerEqual",
    types: ["number"],
    unary: false,
  },
  {
    moduvisValue: "divisibleBy",
    label: "Divizibil cu",
    n8nOperation: "divisibleBy",
    types: ["number"],
    unary: false,
  },
  // Date
  {
    moduvisValue: "after",
    label: "Dupa",
    n8nOperation: "after",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "before",
    label: "Inainte de",
    n8nOperation: "before",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "afterEqual",
    label: "Dupa sau egal",
    n8nOperation: "afterEqual",
    types: ["date"],
    unary: false,
  },
  {
    moduvisValue: "beforeEqual",
    label: "Inainte sau egal",
    n8nOperation: "beforeEqual",
    types: ["date"],
    unary: false,
  },
  // Boolean
  {
    moduvisValue: "true",
    label: "Este adevarat",
    n8nOperation: "true",
    types: ["boolean"],
    unary: true,
  },
  {
    moduvisValue: "false",
    label: "Este fals",
    n8nOperation: "false",
    types: ["boolean"],
    unary: true,
  },
];

export function getOperatorsForType(dataType?: string): OperatorDef[] {
  if (!dataType)
    return OPERATOR_DEFS.filter(
      (o) => o.types.includes("string") || o.types.includes("null"),
    );
  const cat = dataTypeCategory(dataType);
  const allowed = new Set([cat, "null"]); // null operators always available
  return OPERATOR_DEFS.filter((o) => o.types.some((t) => allowed.has(t)));
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
    case "datetime":
      return "date";
    default:
      return "string";
  }
}

export function mapDataTypeToN8nGroup(
  dataType?: string,
): "string" | "number" | "boolean" | "dateTime" {
  switch (dataTypeCategory(dataType ?? "varchar")) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "date":
      return "dateTime";
    default:
      return "string";
  }
}

// ─── Node type definition ───

export interface NodeTypeDefinition {
  type: string;
  label: string;
  icon: string;
  category: "trigger" | "system" | "action" | "logic" | "integration" | "files";
  package?: DocumentPackage;
  inputDocumentPackage?: DocumentPackage;
  outputDocumentPackage?: DocumentPackage;
  color: string;
  description: string;
  defaults: Record<string, any>;
  configFields: NodeConfigField[];
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
  options?: { label: string; value: string }[];
  required?: boolean;
  inputKind?: "email" | "text" | "textarea" | "file-name";
}

export function useNodeTypes() {
  const nodeTypes: NodeTypeDefinition[] = [
    {
      type: "start",
      label: "START",
      icon: "i-lucide-play",
      category: "trigger",
      color: "#22c55e",
      description:
        "Punct de intrare pentru workflow. Se executa automat la trigger (manual sau pe eveniment).",
      defaults: { entity: "" },
      configFields: [
        {
          key: "entity",
          label: "Entitate de start",
          type: "entity-select",
          required: true,
        },
      ],
    },
    // backward compat — old node types mapped to START
    {
      type: "trigger",
      label: "START",
      icon: "i-lucide-play",
      category: "trigger",
      color: "#22c55e",
      description: "",
      defaults: { entity: "" },
      configFields: [
        {
          key: "entity",
          label: "Entitate de start",
          type: "entity-select",
          required: true,
        },
      ],
    },
    {
      type: "webhook_trigger",
      label: "START",
      icon: "i-lucide-play",
      category: "trigger",
      color: "#22c55e",
      description: "",
      defaults: { entity: "" },
      configFields: [
        {
          key: "entity",
          label: "Entitate de start",
          type: "entity-select",
          required: true,
        },
      ],
    },
    {
      type: "system_get_current_profile",
      label: "Profil curent",
      icon: "i-lucide-user-round-check",
      category: "system",
      color: "#6366f1",
      description:
        "Returneaza profilul activ care a initiat executia workflow-ului.",
      defaults: {},
      configFields: [],
    },
    {
      type: "app_get_record",
      label: "Citeste Inregistrari",
      icon: "i-lucide-database-search",
      category: "action",
      color: "#3b82f6",
      description:
        "Citeste inregistrari dintr-o entitate, cu filtre optionale. Daca LIMIT = 1, aduce o singura inregistrare.",
      defaults: {
        entity: "",
        filters: [] as FilterEntry[],
        limit: null as number | null,
      },
      configFields: [
        {
          key: "entity",
          label: "Entitate",
          type: "entity-select",
          required: true,
        },
        { key: "filters", label: "Filtre", type: "filter-list" },
        {
          key: "limit",
          label: "Limit (1 = o inregistrare, gol = toate)",
          type: "number",
          placeholder: "1",
        },
      ],
    },
    {
      type: "app_get_related",
      label: "Citeste Relatie",
      icon: "i-lucide-git-branch",
      category: "action",
      color: "#10b981",
      description:
        "Citeste o inregistrare relationata urmarind un camp de tip relatie. Entitatea tinta si ID-ul se rezolva automat.",
      defaults: {
        sourceNodeId: "",
        relationField: "",
        relationEntitySlug: "",
        relationRecordIdExpr: "",
      },
      configFields: [
        {
          key: "sourceNodeId",
          label: "Entitate sursa",
          type: "data-source-select",
          required: true,
        },
        {
          key: "relationField",
          label: "Camp relatie",
          type: "relation-field-select",
          required: true,
        },
      ],
    },
    {
      type: "app_create_record",
      label: "Creeaza Record",
      icon: "i-lucide-plus-circle",
      category: "action",
      color: "#22c55e",
      description: "Creeaza o inregistrare noua intr-o entitate",
      defaults: { entity: "", fieldMappings: [], fields: {} },
      configFields: [
        {
          key: "entity",
          label: "Entitate",
          type: "entity-select",
          required: true,
        },
        {
          key: "fieldMappings",
          label: "Valori campuri",
          type: "field-mappings",
        },
      ],
    },
    {
      type: "app_update_record",
      label: "Actualizeaza Record",
      icon: "i-lucide-edit",
      category: "action",
      color: "#f59e0b",
      description: "Actualizeaza o inregistrare existenta",
      defaults: {
        entity: "",
        recordId: "",
        recordIdSource: null as RecordIdSource | null,
        fieldMappings: [],
        fields: {},
      },
      configFields: [
        {
          key: "entity",
          label: "Entitate",
          type: "entity-select",
          required: true,
        },
        { key: "recordIdSource", label: "Record ID", type: "record-id-source" },
        {
          key: "fieldMappings",
          label: "Valori campuri",
          type: "field-mappings",
        },
      ],
    },
    {
      type: "email",
      label: "Trimite Email",
      icon: "i-lucide-mail",
      category: "action",
      color: "#8b5cf6",
      description: "Trimite un email catre un destinatar",
      defaults: {
        integrationId: "",
        integrationName: "",
        to: { sourceType: "static", value: "" } as WorkflowValueSource,
        subject: { sourceType: "static", value: "" } as WorkflowValueSource,
        content: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "integrationId",
          label: "Integrare SMTP",
          type: "integration-select",
          required: true,
        },
        {
          key: "to",
          label: "Catre",
          type: "workflow-value-source",
          inputKind: "email",
          required: true,
        },
        {
          key: "subject",
          label: "Subiect",
          type: "workflow-value-source",
          inputKind: "text",
          required: true,
        },
        {
          key: "content",
          label: "Continut",
          type: "workflow-value-source",
          inputKind: "textarea",
          required: true,
        },
      ],
    },
    {
      type: "condition",
      label: "Conditie (If/Else)",
      icon: "i-lucide-git-branch",
      category: "logic",
      color: "#f97316",
      description: "Ramifica workflow-ul bazat pe conditii multiple cu SI/SAU.",
      defaults: { conditions: [], combinator: "and" },
      configFields: [
        { key: "conditions", label: "Conditii", type: "condition-editor" },
      ],
    },
    {
      type: "word_open",
      label: "Open",
      icon: "i-lucide-file-input",
      category: "files",
      package: "word",
      color: "#2563eb",
      description:
        "Deschide versiunea curenta a unui fisier DOCX intr-o sesiune privata de workflow.",
      defaults: {
        fileId: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "fileId",
          label: "Fisier (id_file)",
          type: "workflow-value-source",
          required: true,
        },
      ],
    },
    {
      type: "word_replace_text",
      label: "Replace Text",
      icon: "i-lucide-replace",
      category: "files",
      package: "word",
      color: "#2563eb",
      description:
        "Inlocuieste text literal in continut, tabele, antet, subsol, note si casete text.",
      defaults: {
        documentSourceNodeId: "",
        search: { sourceType: "static", value: "" } as WorkflowValueSource,
        replace: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "search",
          label: "Cauta",
          type: "workflow-value-source",
          required: true,
        },
        {
          key: "replace",
          label: "Inlocuieste cu",
          type: "workflow-value-source",
          required: true,
        },
      ],
    },
    {
      type: "word_create_table_rows",
      label: "Create Table Rows",
      icon: "i-lucide-table-rows-split",
      category: "files",
      package: "word",
      color: "#2563eb",
      description:
        "Copiaza randul sablon, indexeaza copiile si elimina sablonul original.",
      defaults: {
        documentSourceNodeId: "",
        search: { sourceType: "static", value: "" } as WorkflowValueSource,
        nrOfNewRows: {
          sourceType: "static",
          value: "1",
        } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "search",
          label: "Text sablon",
          type: "workflow-value-source",
          required: true,
        },
        {
          key: "nrOfNewRows",
          label: "Numar randuri",
          type: "workflow-value-source",
          required: true,
        },
      ],
    },
    {
      type: "word_insert_table_rows",
      label: "Insert Table Rows",
      icon: "i-lucide-rows-3",
      category: "files",
      package: "word",
      color: "#2563eb",
      description:
        "Insereaza randuri goale cu stilul randului sablon si pastreaza sablonul.",
      defaults: {
        documentSourceNodeId: "",
        search: { sourceType: "static", value: "" } as WorkflowValueSource,
        nrOfNewRows: {
          sourceType: "static",
          value: "1",
        } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "search",
          label: "Text sablon",
          type: "workflow-value-source",
          required: true,
        },
        {
          key: "nrOfNewRows",
          label: "Numar randuri",
          type: "workflow-value-source",
          required: true,
        },
      ],
    },
    {
      type: "word_convert_to_pdf",
      label: "Convert to PDF",
      icon: "i-lucide-file-output",
      category: "files",
      package: "word",
      inputDocumentPackage: "word",
      outputDocumentPackage: "pdf",
      color: "#2563eb",
      description:
        "Converteste documentul Word curent intr-un document PDF temporar.",
      defaults: {
        documentSourceNodeId: "",
        fileName: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "fileName",
          label: "Nume PDF (optional)",
          type: "workflow-value-source",
          inputKind: "file-name",
        },
      ],
    },
    {
      type: "word_save",
      label: "Save",
      icon: "i-lucide-save",
      category: "files",
      package: "word",
      color: "#2563eb",
      description:
        "Salveaza documentul ca fisier logic nou, neatasat, si returneaza id_file.",
      defaults: {
        documentSourceNodeId: "",
        fileName: {
          sourceType: "static",
          value: "document.docx",
        } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "fileName",
          label: "Nume fisier",
          type: "workflow-value-source",
          required: true,
          inputKind: "file-name",
        },
      ],
    },
    {
      type: "word_update",
      label: "Update",
      icon: "i-lucide-file-up",
      category: "files",
      package: "word",
      color: "#2563eb",
      description: "Creeaza o versiune noua si pastreaza acelasi id_file.",
      defaults: {
        documentSourceNodeId: "",
        fileId: { sourceType: "static", value: "" } as WorkflowValueSource,
        fileName: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document Word",
          type: "document-source-select",
          required: true,
        },
        {
          key: "fileId",
          label: "Fisier de actualizat (id_file)",
          type: "workflow-value-source",
          required: true,
        },
        {
          key: "fileName",
          label: "Nume nou (optional)",
          type: "workflow-value-source",
          inputKind: "file-name",
        },
      ],
    },
    {
      type: "pdf_open",
      label: "Open",
      icon: "i-lucide-file-input",
      category: "files",
      package: "pdf",
      outputDocumentPackage: "pdf",
      color: "#dc2626",
      description:
        "Deschide versiunea curenta a unui fisier PDF intr-o sesiune privata de workflow.",
      defaults: {
        fileId: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "fileId",
          label: "Fisier PDF (id_file)",
          type: "workflow-value-source",
          required: true,
        },
      ],
    },
    {
      type: "pdf_save",
      label: "Save",
      icon: "i-lucide-save",
      category: "files",
      package: "pdf",
      inputDocumentPackage: "pdf",
      outputDocumentPackage: "pdf",
      color: "#dc2626",
      description:
        "Salveaza documentul PDF ca fisier logic nou si returneaza id_file.",
      defaults: {
        documentSourceNodeId: "",
        fileName: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document PDF",
          type: "document-source-select",
          required: true,
        },
        {
          key: "fileName",
          label: "Nume fisier (optional)",
          type: "workflow-value-source",
          inputKind: "file-name",
        },
      ],
    },
    {
      type: "pdf_update",
      label: "Update",
      icon: "i-lucide-file-up",
      category: "files",
      package: "pdf",
      inputDocumentPackage: "pdf",
      outputDocumentPackage: "pdf",
      color: "#dc2626",
      description:
        "Creeaza o versiune PDF noua si pastreaza acelasi id_file.",
      defaults: {
        documentSourceNodeId: "",
        fileId: { sourceType: "static", value: "" } as WorkflowValueSource,
        fileName: { sourceType: "static", value: "" } as WorkflowValueSource,
      },
      configFields: [
        {
          key: "documentSourceNodeId",
          label: "Document PDF",
          type: "document-source-select",
          required: true,
        },
        {
          key: "fileId",
          label: "Fisier PDF de actualizat (id_file)",
          type: "workflow-value-source",
          required: true,
        },
        {
          key: "fileName",
          label: "Nume nou (optional)",
          type: "workflow-value-source",
          inputKind: "file-name",
        },
      ],
    },
    {
      type: "notification",
      label: "Trimite Notificare",
      icon: "i-lucide-bell",
      category: "action",
      color: "#6366f1",
      description: "Trimite o notificare in aplicatie catre un profil activ.",
      defaults: {
        recipient: null as NotificationRecipient | null,
        subjectTokens: [] as TextTemplateToken[],
        contentTokens: [] as TextTemplateToken[],
        targetSourceNodeId: "",
      },
      configFields: [
        {
          key: "recipient",
          label: "Destinatar",
          type: "notification-recipient",
          required: true,
        },
        {
          key: "subjectTokens",
          label: "Subiect",
          type: "text-template",
          required: true,
        },
        {
          key: "contentTokens",
          label: "Continut",
          type: "text-template",
          required: true,
        },
        {
          key: "targetSourceNodeId",
          label: "Record de deschis (optional)",
          type: "data-source-select",
        },
      ],
    },
    {
      type: "for_each",
      label: "Pentru Fiecare",
      icon: "i-lucide-repeat-2",
      category: "logic",
      color: "#14b8a6",
      description:
        "Ruleaza nodurile urmatoare o data pentru fiecare inregistrare dintr-o lista.",
      defaults: { sourceNodeId: "" },
      configFields: [
        {
          key: "sourceNodeId",
          label: "Lista de inregistrari",
          type: "list-source-select",
          required: true,
        },
      ],
    },
    {
      type: "validate",
      label: "Validare",
      icon: "i-lucide-shield-check",
      category: "logic",
      color: "#f59e0b",
      description:
        "Opreste workflow-ul cu eroare cand conditia este indeplinita.",
      defaults: { conditions: [], combinator: "and", message: "" },
      configFields: [
        {
          key: "conditions",
          label: "Conditii de eroare",
          type: "condition-editor",
          required: true,
        },
        {
          key: "message",
          label: "Mesaj eroare",
          type: "textarea",
          required: true,
        },
      ],
    },
    {
      type: "stop_error",
      label: "Stop cu Eroare",
      icon: "i-lucide-octagon-x",
      category: "logic",
      color: "#ef4444",
      description: "Opreste workflow-ul si returneaza un mesaj de eroare.",
      defaults: { message: "" },
      configFields: [
        {
          key: "message",
          label: "Mesaj eroare",
          type: "textarea",
          required: true,
        },
      ],
    },
    {
      type: "delay",
      label: "Asteapta",
      icon: "i-lucide-clock",
      category: "logic",
      color: "#64748b",
      description: "Pauza inainte de a continua executia",
      defaults: { duration: 1, unit: "minutes" },
      configFields: [
        { key: "duration", label: "Durata", type: "number", required: true },
        {
          key: "unit",
          label: "Unitate",
          type: "select",
          options: [
            { label: "Secunde", value: "seconds" },
            { label: "Minute", value: "minutes" },
            { label: "Ore", value: "hours" },
            { label: "Zile", value: "days" },
          ],
        },
      ],
    },
    {
      type: "http_request",
      label: "HTTP Request",
      icon: "i-lucide-globe",
      category: "integration",
      color: "#06b6d4",
      description: "Trimite o cerere HTTP catre un serviciu extern",
      defaults: { method: "GET", url: "" },
      configFields: [
        {
          key: "method",
          label: "Metoda",
          type: "select",
          options: [
            { label: "GET", value: "GET" },
            { label: "POST", value: "POST" },
            { label: "PUT", value: "PUT" },
            { label: "DELETE", value: "DELETE" },
          ],
        },
        {
          key: "url",
          label: "URL",
          type: "text",
          required: true,
          placeholder: "https://api.example.com/endpoint",
        },
        { key: "body", label: "Body (JSON)", type: "textarea" },
      ],
    },
    {
      type: "set_data",
      label: "Set/Calculeaza",
      icon: "i-lucide-calculator",
      category: "action",
      color: "#ec4899",
      description:
        "Adauga campuri calculate folosind campuri din nodurile anterioare si operatori matematici.",
      defaults: { assignments: [] },
      configFields: [
        {
          key: "assignments",
          label: "Valori de setat",
          type: "formula-assignments",
        },
      ],
    },
    {
      type: "code",
      label: "Cod Custom",
      icon: "i-lucide-code",
      category: "logic",
      color: "#a855f7",
      description: "Executa cod JavaScript custom",
      defaults: { code: "return items;" },
      configFields: [
        {
          key: "code",
          label: "Cod JavaScript",
          type: "textarea",
          required: true,
        },
      ],
    },
  ];

  const categories = [
    { key: "trigger", label: "Triggers", icon: "i-lucide-play" },
    { key: "system", label: "Sistem", icon: "i-lucide-settings" },
    { key: "action", label: "Actiuni", icon: "i-lucide-database" },
    { key: "files", label: "Fișiere", icon: "i-lucide-folder-open" },
    { key: "logic", label: "Logica", icon: "i-lucide-git-branch" },
    { key: "integration", label: "Integratii", icon: "i-lucide-plug" },
  ];

  function getNodeType(type: string): NodeTypeDefinition | undefined {
    return nodeTypes.find((n) => n.type === type);
  }

  const legacyTypes = new Set(["trigger", "webhook_trigger"]);

  function getNodesByCategory(category: string): NodeTypeDefinition[] {
    return nodeTypes.filter(
      (n) => n.category === category && !legacyTypes.has(n.type),
    );
  }

  return {
    nodeTypes,
    categories,
    getNodeType,
    getNodesByCategory,
  };
}
