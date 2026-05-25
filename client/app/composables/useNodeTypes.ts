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
  type: 'text' | 'textarea' | 'select' | 'number' | 'boolean' | 'entity-select' | 'field-select'
  placeholder?: string
  options?: { label: string, value: string }[]
  required?: boolean
}

export function useNodeTypes() {
  const nodeTypes: NodeTypeDefinition[] = [
    {
      type: 'trigger',
      label: 'Manual Trigger',
      icon: 'i-lucide-play',
      category: 'trigger',
      color: '#22c55e',
      description: 'Porneste workflow-ul la click manual de catre utilizator',
      defaults: {},
      configFields: []
    },
    {
      type: 'webhook_trigger',
      label: 'Event Trigger',
      icon: 'i-lucide-zap',
      category: 'trigger',
      color: '#eab308',
      description: 'Porneste workflow-ul automat la un eveniment (create, update, delete)',
      defaults: { event: 'record.created' },
      configFields: [
        {
          key: 'event',
          label: 'Eveniment',
          type: 'select',
          options: [
            { label: 'Record creat', value: 'record.created' },
            { label: 'Record actualizat', value: 'record.updated' },
            { label: 'Record sters', value: 'record.deleted' }
          ]
        }
      ]
    },
    {
      type: 'app_get_record',
      label: 'Citeste Record',
      icon: 'i-lucide-download',
      category: 'action',
      color: '#3b82f6',
      description: 'Citeste o inregistrare dintr-o entitate',
      defaults: { entity: '', recordId: '' },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'recordId', label: 'Record ID', type: 'text', placeholder: '{{$json.recordId}}' }
      ]
    },
    {
      type: 'app_create_record',
      label: 'Creeaza Record',
      icon: 'i-lucide-plus-circle',
      category: 'action',
      color: '#22c55e',
      description: 'Creeaza o inregistrare noua intr-o entitate',
      defaults: { entity: '', fields: {} },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true }
      ]
    },
    {
      type: 'app_update_record',
      label: 'Actualizeaza Record',
      icon: 'i-lucide-edit',
      category: 'action',
      color: '#f59e0b',
      description: 'Actualizeaza o inregistrare existenta',
      defaults: { entity: '', recordId: '', fields: {} },
      configFields: [
        { key: 'entity', label: 'Entitate', type: 'entity-select', required: true },
        { key: 'recordId', label: 'Record ID', type: 'text', placeholder: '{{$json.recordId}}' }
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

  function getNodesByCategory(category: string): NodeTypeDefinition[] {
    return nodeTypes.filter(n => n.category === category)
  }

  return {
    nodeTypes,
    categories,
    getNodeType,
    getNodesByCategory
  }
}
