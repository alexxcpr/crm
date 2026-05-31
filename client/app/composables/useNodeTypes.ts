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
  sourceType: 'static' | 'current_record' | 'previous_node' | 'node_output'
  value: string
  sourceNodeId?: string
  sourceFieldSlug?: string
}

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
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'entity-select' | 'field-select' | 'field-mappings' | 'record-id-source' | 'data-source-select' | 'relation-field-select' | 'formula-assignments' | 'target-field-select'
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
      label: 'Citeste Record',
      icon: 'i-lucide-download',
      category: 'action',
      color: '#3b82f6',
      description: 'Citeste o inregistrare dintr-o entitate dupa ID sau dupa un camp specific.',
      defaults: { entity: '', recordId: '', filterField: '', filterValueSource: null as RecordIdSource | null },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'recordId', label: 'Record ID (optional)', type: 'text', placeholder: 'ID sau lasa gol pentru filtru' },
        { key: 'filterField', label: 'Camp filtru (optional)', type: 'target-field-select', placeholder: 'Alege campul pentru WHERE' },
        { key: 'filterValueSource', label: 'Valoare filtru', type: 'record-id-source' }
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
      description: 'Ramifica workflow-ul bazat pe o conditie',
      defaults: { field: '', operator: 'equals', value: '' },
      configFields: [
        { key: 'field', label: 'Camp', type: 'text', required: true, placeholder: 'status' },
        {
          key: 'operator',
          label: 'Operator',
          type: 'select',
          options: [
            { label: 'Egal cu', value: 'equals' },
            { label: 'Diferit de', value: 'notEquals' },
            { label: 'Contine', value: 'contains' },
            { label: 'Mai mare decat', value: 'greaterThan' },
            { label: 'Mai mic decat', value: 'lessThan' }
          ]
        },
        { key: 'value', label: 'Valoare', type: 'text', required: true }
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
