export type FieldValueSource = 'static' | 'current_record' | 'previous_node' | 'relation' | 'expression' | 'node_output'

export interface FormulaToken {
  type: 'field' | 'literal' | 'operator' | 'group_start' | 'group_end'
  sourceNodeId?: string
  fieldSlug?: string
  fieldLabel?: string
  sourceLabel?: string
  value?: string
}

export interface FormulaAssignment {
  key: string
  tokens: FormulaToken[]
}

export interface FieldMapping {
  key: string
  sourceType: FieldValueSource
  sourceNodeId?: string
  sourceFieldSlug?: string
  value: string
}

export interface RecordIdSource {
  sourceType: 'static' | 'node_output'
  value: string
  sourceNodeId?: string
  sourceFieldSlug?: string
}

export interface FilterEntry {
  field: string
  operator: string
  valueSource: RecordIdSource
}

// ─── Condition / IF node types ───

export type ConditionOperandSource = 'static' | 'node_output'

export interface ConditionOperand {
  sourceType: ConditionOperandSource
  sourceNodeId?: string
  fieldSlug?: string
  fieldLabel?: string
  dataType?: string
  value?: string
}

export interface Condition {
  id: string
  leftOperand: ConditionOperand
  operator: string
  rightOperand: ConditionOperand
}

export interface OperatorDef {
  moduvisValue: string
  label: string
  n8nOperation: string
  types: string[]
  unary: boolean
}

export const OPERATOR_DEFS: OperatorDef[] = [
  // Universali
  { moduvisValue: 'equals',       label: 'Egal cu',              n8nOperation: 'equals',       types: ['string', 'number', 'date', 'boolean'], unary: false },
  { moduvisValue: 'notEquals',    label: 'Diferit de',           n8nOperation: 'notEquals',    types: ['string', 'number', 'date', 'boolean'], unary: false },
  { moduvisValue: 'isNull',       label: 'Este gol (null)',      n8nOperation: 'isEmpty',      types: ['null'], unary: true },
  { moduvisValue: 'isNotNull',    label: 'Nu este gol',          n8nOperation: 'isNotEmpty',   types: ['null'], unary: true },
  // String
  { moduvisValue: 'contains',     label: 'Contine',              n8nOperation: 'contains',     types: ['string'], unary: false },
  { moduvisValue: 'startsWith',   label: 'Incepe cu',            n8nOperation: 'startsWith',   types: ['string'], unary: false },
  { moduvisValue: 'endsWith',     label: 'Se termina cu',        n8nOperation: 'endsWith',     types: ['string'], unary: false },
  { moduvisValue: 'regex',        label: 'Regex',                n8nOperation: 'regex',        types: ['string'], unary: false },
  // Number
  { moduvisValue: 'larger',       label: 'Mai mare decat',       n8nOperation: 'larger',       types: ['number'], unary: false },
  { moduvisValue: 'smaller',      label: 'Mai mic decat',        n8nOperation: 'smaller',      types: ['number'], unary: false },
  { moduvisValue: 'largerEqual',  label: 'Mai mare sau egal',   n8nOperation: 'largerEqual',  types: ['number'], unary: false },
  { moduvisValue: 'smallerEqual', label: 'Mai mic sau egal',    n8nOperation: 'smallerEqual', types: ['number'], unary: false },
  { moduvisValue: 'divisibleBy',  label: 'Divizibil cu',         n8nOperation: 'divisibleBy',  types: ['number'], unary: false },
  // Date
  { moduvisValue: 'after',        label: 'Dupa',                 n8nOperation: 'after',        types: ['date'], unary: false },
  { moduvisValue: 'before',       label: 'Inainte de',           n8nOperation: 'before',       types: ['date'], unary: false },
  { moduvisValue: 'afterEqual',   label: 'Dupa sau egal',       n8nOperation: 'afterEqual',   types: ['date'], unary: false },
  { moduvisValue: 'beforeEqual',  label: 'Inainte sau egal',    n8nOperation: 'beforeEqual',  types: ['date'], unary: false },
  // Boolean
  { moduvisValue: 'true',         label: 'Este adevarat',        n8nOperation: 'true',         types: ['boolean'], unary: true },
  { moduvisValue: 'false',        label: 'Este fals',            n8nOperation: 'false',        types: ['boolean'], unary: true },
]

export function getOperatorsForType(dataType?: string): OperatorDef[] {
  if (!dataType) return OPERATOR_DEFS.filter(o => o.types.includes('string') || o.types.includes('null'))
  const cat = dataTypeCategory(dataType)
  const allowed = new Set([cat, 'null']) // null operators always available
  return OPERATOR_DEFS.filter(o => o.types.some(t => allowed.has(t)))
}

export function dataTypeCategory(dataType: string): string {
  switch (dataType) {
    case 'varchar': case 'text': case 'uuid': return 'string'
    case 'integer': case 'numeric': return 'number'
    case 'boolean': return 'boolean'
    case 'datetime': return 'date'
    default: return 'string'
  }
}

export function mapDataTypeToN8nGroup(dataType?: string): 'string' | 'number' | 'boolean' | 'dateTime' {
  switch (dataTypeCategory(dataType ?? 'varchar')) {
    case 'string': return 'string'
    case 'number': return 'number'
    case 'boolean': return 'boolean'
    case 'date': return 'dateTime'
    default: return 'string'
  }
}

// ─── Node type definition ───

export interface NodeTypeDefinition {
  type: string
  label: string
  icon: string
  category: 'trigger' | 'action' | 'logic' | 'integration'
  color: string
  description: string
  defaults: Record<string, any>
  configFields: NodeConfigField[]
}

export interface NodeConfigField {
  key: string
  label: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'entity-select' | 'field-select' | 'field-mappings' | 'record-id-source' | 'data-source-select' | 'relation-field-select' | 'formula-assignments' | 'target-field-select' | 'condition-editor' | 'filter-list'
  placeholder?: string
  options?: { label: string, value: string }[]
  required?: boolean
}

export function useNodeTypes() {
  const nodeTypes: NodeTypeDefinition[] = [
    {
      type: 'start',
      label: 'START',
      icon: 'i-lucide-play',
      category: 'trigger',
      color: '#22c55e',
      description: 'Punct de intrare pentru workflow. Se executa automat la trigger (manual sau pe eveniment).',
      defaults: { entity: '' },
      configFields: [
        { key: 'entity', label: 'Entitate de start', type: 'entity-select', required: true }
      ]
    },
    // backward compat — old node types mapped to START
    {
      type: 'trigger',
      label: 'START',
      icon: 'i-lucide-play',
      category: 'trigger',
      color: '#22c55e',
      description: '',
      defaults: { entity: '' },
      configFields: [
        { key: 'entity', label: 'Entitate de start', type: 'entity-select', required: true }
      ]
    },
    {
      type: 'webhook_trigger',
      label: 'START',
      icon: 'i-lucide-play',
      category: 'trigger',
      color: '#22c55e',
      description: '',
      defaults: { entity: '' },
      configFields: [
        { key: 'entity', label: 'Entitate de start', type: 'entity-select', required: true }
      ]
    },
    {
      type: 'app_get_record',
      label: 'Citeste Inregistrari',
      icon: 'i-lucide-database-search',
      category: 'action',
      color: '#3b82f6',
      description: 'Citeste inregistrari dintr-o entitate, cu filtre optionale. Daca LIMIT = 1, aduce o singura inregistrare.',
      defaults: { entity: '', filters: [] as FilterEntry[], limit: null as number | null },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'filters', label: 'Filtre', type: 'filter-list' },
        { key: 'limit', label: 'Limit (1 = o inregistrare, gol = toate)', type: 'number', placeholder: '1' }
      ]
    },
    {
      type: 'app_get_related',
      label: 'Citeste Relatie',
      icon: 'i-lucide-git-branch',
      category: 'action',
      color: '#10b981',
      description: 'Citeste o inregistrare relationata urmarind un camp de tip relatie. Entitatea tinta si ID-ul se rezolva automat.',
      defaults: { sourceNodeId: '', relationField: '', relationEntitySlug: '', relationRecordIdExpr: '' },
      configFields: [
        { key: 'sourceNodeId', label: 'Entitate sursa', type: 'data-source-select', required: true },
        { key: 'relationField', label: 'Camp relatie', type: 'relation-field-select', required: true }
      ]
    },
    {
      type: 'app_create_record',
      label: 'Creeaza Record',
      icon: 'i-lucide-plus-circle',
      category: 'action',
      color: '#22c55e',
      description: 'Creeaza o inregistrare noua intr-o entitate',
      defaults: { entity: '', fieldMappings: [], fields: {} },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'fieldMappings', label: 'Valori campuri', type: 'field-mappings' }
      ]
    },
    {
      type: 'app_update_record',
      label: 'Actualizeaza Record',
      icon: 'i-lucide-edit',
      category: 'action',
      color: '#f59e0b',
      description: 'Actualizeaza o inregistrare existenta',
      defaults: { entity: '', recordId: '', recordIdSource: null as RecordIdSource | null, fieldMappings: [], fields: {} },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'recordIdSource', label: 'Record ID', type: 'record-id-source' },
        { key: 'fieldMappings', label: 'Valori campuri', type: 'field-mappings' }
      ]
    },
    {
      type: 'email',
      label: 'Trimite Email',
      icon: 'i-lucide-mail',
      category: 'action',
      color: '#8b5cf6',
      description: 'Trimite un email catre un destinatar',
      defaults: { to: '', subject: '', body: '' },
      configFields: [
        { key: 'from', label: 'De la', type: 'text', placeholder: 'noreply@company.ro' },
        { key: 'to', label: 'Catre', type: 'text', placeholder: '{{$json.email}}', required: true },
        { key: 'subject', label: 'Subiect', type: 'text', required: true },
        { key: 'body', label: 'Continut', type: 'textarea', required: true }
      ]
    },
    {
      type: 'condition',
      label: 'Conditie (If/Else)',
      icon: 'i-lucide-git-branch',
      category: 'logic',
      color: '#f97316',
      description: 'Ramifica workflow-ul bazat pe conditii multiple cu SI/SAU.',
      defaults: { conditions: [], combinator: 'and' },
      configFields: [
        { key: 'conditions', label: 'Conditii', type: 'condition-editor' }
      ]
    },
    {
      type: 'delay',
      label: 'Asteapta',
      icon: 'i-lucide-clock',
      category: 'logic',
      color: '#64748b',
      description: 'Pauza inainte de a continua executia',
      defaults: { duration: 1, unit: 'minutes' },
      configFields: [
        { key: 'duration', label: 'Durata', type: 'number', required: true },
        {
          key: 'unit',
          label: 'Unitate',
          type: 'select',
          options: [
            { label: 'Secunde', value: 'seconds' },
            { label: 'Minute', value: 'minutes' },
            { label: 'Ore', value: 'hours' },
            { label: 'Zile', value: 'days' }
          ]
        }
      ]
    },
    {
      type: 'http_request',
      label: 'HTTP Request',
      icon: 'i-lucide-globe',
      category: 'integration',
      color: '#06b6d4',
      description: 'Trimite o cerere HTTP catre un serviciu extern',
      defaults: { method: 'GET', url: '' },
      configFields: [
        {
          key: 'method',
          label: 'Metoda',
          type: 'select',
          options: [
            { label: 'GET', value: 'GET' },
            { label: 'POST', value: 'POST' },
            { label: 'PUT', value: 'PUT' },
            { label: 'DELETE', value: 'DELETE' }
          ]
        },
        { key: 'url', label: 'URL', type: 'text', required: true, placeholder: 'https://api.example.com/endpoint' },
        { key: 'body', label: 'Body (JSON)', type: 'textarea' }
      ]
    },
    {
      type: 'set_data',
      label: 'Set/Calculeaza',
      icon: 'i-lucide-calculator',
      category: 'action',
      color: '#ec4899',
      description: 'Adauga campuri calculate folosind campuri din nodurile anterioare si operatori matematici.',
      defaults: { assignments: [] },
      configFields: [
        { key: 'assignments', label: 'Valori de setat', type: 'formula-assignments' }
      ]
    },
    {
      type: 'code',
      label: 'Cod Custom',
      icon: 'i-lucide-code',
      category: 'logic',
      color: '#a855f7',
      description: 'Executa cod JavaScript custom',
      defaults: { code: 'return items;' },
      configFields: [
        { key: 'code', label: 'Cod JavaScript', type: 'textarea', required: true }
      ]
    }
  ]

  const categories = [
    { key: 'trigger', label: 'Triggers', icon: 'i-lucide-play' },
    { key: 'action', label: 'Actiuni', icon: 'i-lucide-database' },
    { key: 'logic', label: 'Logica', icon: 'i-lucide-git-branch' },
    { key: 'integration', label: 'Integratii', icon: 'i-lucide-plug' }
  ]

  function getNodeType(type: string): NodeTypeDefinition | undefined {
    return nodeTypes.find(n => n.type === type)
  }

  const legacyTypes = new Set(['trigger', 'webhook_trigger'])

  function getNodesByCategory(category: string): NodeTypeDefinition[] {
    return nodeTypes.filter(n => n.category === category && !legacyTypes.has(n.type))
  }

  return {
    nodeTypes,
    categories,
    getNodeType,
    getNodesByCategory
  }
}
