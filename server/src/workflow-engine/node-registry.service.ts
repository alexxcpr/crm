import { Injectable } from '@nestjs/common';
import type { WorkflowNodeDefinition } from './workflow-engine.types';

const entityField = {
  key: 'entity',
  label: 'Entitate',
  type: 'entity-select',
  required: true,
};

const documentNodes: WorkflowNodeDefinition[] = [
  {
    type: 'word_open',
    version: 1,
    label: 'Open',
    icon: 'i-lucide-file-input',
    category: 'files',
    color: '#2563eb',
    description: 'Deschide un document Word.',
    defaults: {
      fileId: { sourceType: 'static', value: '' },
    },
    configFields: [
      {
        key: 'fileId',
        label: 'Fisier',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    documentPackage: 'word',
  },
  {
    type: 'word_replace_text',
    version: 1,
    label: 'Replace Text',
    icon: 'i-lucide-replace',
    category: 'files',
    color: '#2563eb',
    description:
      'Inlocuieste text intr-un document Word.',
    defaults: {
      documentSourceNodeId: '',
      search: { sourceType: 'static', value: '' },
      replace: {
        sourceType: 'static',
        value: '',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'search',
        label: 'Cauta',
        type: 'workflow-value-source',
        required: true,
      },
      {
        key: 'replace',
        label: 'Inlocuieste cu',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'word',
  },
  {
    type: 'word_create_table_rows',
    version: 1,
    label: 'Create Table Rows',
    icon: 'i-lucide-table-rows-split',
    category: 'files',
    color: '#2563eb',
    description:
      'Copiaza randul sablon intr-un document Word.',
    defaults: {
      documentSourceNodeId: '',
      search: { sourceType: 'static', value: '' },
      nrOfNewRows: {
        sourceType: 'static',
        value: '1',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'search',
        label: 'Text sablon',
        type: 'workflow-value-source',
        required: true,
      },
      {
        key: 'nrOfNewRows',
        label: 'Numar randuri',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'word',
  },
  {
    type: 'word_insert_table_rows',
    version: 1,
    label: 'Insert Table Rows',
    icon: 'i-lucide-rows-3',
    category: 'files',
    color: '#2563eb',
    description:
      'Insereaza randuri intr-un document Word.',
    defaults: {
      documentSourceNodeId: '',
      search: { sourceType: 'static', value: '' },
      nrOfNewRows: {
        sourceType: 'static',
        value: '1',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'search',
        label: 'Text sablon',
        type: 'workflow-value-source',
        required: true,
      },
      {
        key: 'nrOfNewRows',
        label: 'Numar randuri',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'word',
  },
  {
    type: 'word_convert_to_pdf',
    version: 1,
    label: 'Convert to PDF',
    icon: 'i-lucide-file-output',
    category: 'files',
    color: '#2563eb',
    description:
      'Converteste un document Word in PDF.',
    defaults: {
      documentSourceNodeId: '',
      fileName: {
        sourceType: 'static',
        value: '',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'fileName',
        label: 'Nume PDF',
        type: 'workflow-value-source',
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'pdf',
  },
  {
    type: 'word_save',
    version: 1,
    label: 'Save',
    icon: 'i-lucide-save',
    category: 'files',
    color: '#2563eb',
    description: 'Salveaza un document Word.',
    defaults: {
      documentSourceNodeId: '',
      fileName: {
        sourceType: 'static',
        value: 'document.docx',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'fileName',
        label: 'Nume fisier',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'word',
  },
  {
    type: 'word_update',
    version: 1,
    label: 'Update',
    icon: 'i-lucide-file-up',
    category: 'files',
    color: '#2563eb',
    description:
      'Creeaza o versiune noua pentru documentul Word.',
    defaults: {
      documentSourceNodeId: '',
      fileId: { sourceType: 'static', value: '' },
      fileName: {
        sourceType: 'static',
        value: '',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document Word',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'fileId',
        label: 'Fisier',
        type: 'workflow-value-source',
        required: true,
      },
      {
        key: 'fileName',
        label: 'Nume nou',
        type: 'workflow-value-source',
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'word',
    documentPackage: 'word',
  },
  {
    type: 'pdf_open',
    version: 1,
    label: 'Open',
    icon: 'i-lucide-file-input',
    category: 'files',
    color: '#dc2626',
    description: 'Deschide un document PDF.',
    defaults: {
      fileId: { sourceType: 'static', value: '' },
    },
    configFields: [
      {
        key: 'fileId',
        label: 'Fisier PDF',
        type: 'workflow-value-source',
        required: true,
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    documentPackage: 'pdf',
  },
  {
    type: 'pdf_save',
    version: 1,
    label: 'Save',
    icon: 'i-lucide-save',
    category: 'files',
    color: '#dc2626',
    description: 'Salveaza un document PDF.',
    defaults: {
      documentSourceNodeId: '',
      fileName: {
        sourceType: 'static',
        value: '',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document PDF',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'fileName',
        label: 'Nume fisier',
        type: 'workflow-value-source',
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'pdf',
    documentPackage: 'pdf',
  },
  {
    type: 'pdf_update',
    version: 1,
    label: 'Update',
    icon: 'i-lucide-file-up',
    category: 'files',
    color: '#dc2626',
    description:
      'Creeaza o versiune noua pentru documentul PDF.',
    defaults: {
      documentSourceNodeId: '',
      fileId: { sourceType: 'static', value: '' },
      fileName: {
        sourceType: 'static',
        value: '',
      },
    },
    configFields: [
      {
        key: 'documentSourceNodeId',
        label: 'Document PDF',
        type: 'document-source-select',
        required: true,
      },
      {
        key: 'fileId',
        label: 'Fisier PDF',
        type: 'workflow-value-source',
        required: true,
      },
      {
        key: 'fileName',
        label: 'Nume nou',
        type: 'workflow-value-source',
      },
    ],
    beforePolicy: 'none',
    outputKind: 'document',
    inputDocumentPackage: 'pdf',
    documentPackage: 'pdf',
  },
];

@Injectable()
export class NodeRegistryService {
  private readonly definitions: WorkflowNodeDefinition[] =
    [
      {
        type: 'start',
        version: 1,
        label: 'START',
        icon: 'i-lucide-play',
        category: 'trigger',
        color: '#22c55e',
        description:
          'Punctul unic de intrare in workflow.',
        defaults: { entity: '' },
        configFields: [
          {
            key: 'entity',
            label: 'Entitate de start',
            type: 'entity-select',
            required: true,
          },
        ],
        beforePolicy: 'all',
        outputKind: 'record',
      },
      {
        type: 'system_get_current_profile',
        version: 1,
        label: 'Profil curent',
        icon: 'i-lucide-user-round-check',
        category: 'system',
        color: '#6366f1',
        description:
          'Returneaza profilul care a initiat executia.',
        defaults: {},
        configFields: [],
        beforePolicy: 'all',
        outputKind: 'record',
      },
      {
        type: 'app_get_record',
        version: 1,
        label: 'Citeste Inregistrari',
        icon: 'i-lucide-database-search',
        category: 'action',
        color: '#3b82f6',
        description:
          'Citeste inregistrari cu filtre si limita.',
        defaults: {
          entity: '',
          filters: [],
          limit: null,
        },
        configFields: [
          entityField,
          {
            key: 'filters',
            label: 'Filtre',
            type: 'filter-list',
          },
          {
            key: 'limit',
            label: 'Limit',
            type: 'number',
          },
        ],
        beforePolicy: 'all',
        outputKind: 'list',
      },
      {
        type: 'app_get_related',
        version: 1,
        label: 'Citeste Relatie',
        icon: 'i-lucide-git-branch',
        category: 'action',
        color: '#10b981',
        description:
          'Citeste o inregistrare relationata.',
        defaults: {
          sourceNodeId: '',
          relationField: '',
          relationEntitySlug: '',
        },
        configFields: [
          {
            key: 'sourceNodeId',
            label: 'Entitate sursa',
            type: 'data-source-select',
            required: true,
          },
          {
            key: 'relationField',
            label: 'Camp relatie',
            type: 'relation-field-select',
            required: true,
          },
        ],
        beforePolicy: 'all',
        outputKind: 'record',
      },
      {
        type: 'app_create_record',
        version: 1,
        label: 'Creeaza Record',
        icon: 'i-lucide-plus-circle',
        category: 'action',
        color: '#22c55e',
        description: 'Creeaza o inregistrare.',
        defaults: {
          entity: '',
          fieldMappings: [],
          fields: {},
        },
        configFields: [
          entityField,
          {
            key: 'fieldMappings',
            label: 'Valori campuri',
            type: 'field-mappings',
          },
        ],
        beforePolicy: 'none',
        outputKind: 'record',
      },
      {
        type: 'app_update_record',
        version: 1,
        label: 'Actualizeaza Record',
        icon: 'i-lucide-edit',
        category: 'action',
        color: '#f59e0b',
        description:
          'Actualizeaza o inregistrare sau datele curente.',
        defaults: {
          entity: '',
          recordId: '',
          recordIdSource: null,
          fieldMappings: [],
          fields: {},
        },
        configFields: [
          entityField,
          {
            key: 'recordIdSource',
            label: 'Record ID',
            type: 'record-id-source',
          },
          {
            key: 'fieldMappings',
            label: 'Valori campuri',
            type: 'field-mappings',
          },
        ],
        beforePolicy: 'insert-update',
        outputKind: 'record',
      },
      {
        type: 'email',
        version: 1,
        label: 'Trimite Email',
        icon: 'i-lucide-mail',
        category: 'action',
        color: '#8b5cf6',
        description:
          'Trimite un email prin integrarea SMTP selectata.',
        defaults: {
          integrationId: '',
          integrationName: '',
          to: { sourceType: 'static', value: '' },
          subject: {
            sourceType: 'static',
            value: '',
          },
          content: {
            sourceType: 'static',
            value: '',
          },
        },
        configFields: [
          {
            key: 'integrationId',
            label: 'Integrare SMTP',
            type: 'integration-select',
            required: true,
          },
          {
            key: 'to',
            label: 'Catre',
            type: 'workflow-value-source',
            inputKind: 'email',
            required: true,
          },
          {
            key: 'subject',
            label: 'Subiect',
            type: 'workflow-value-source',
            required: true,
          },
          {
            key: 'content',
            label: 'Continut',
            type: 'workflow-value-source',
            inputKind: 'textarea',
            required: true,
          },
        ],
        beforePolicy: 'none',
        outputKind: 'value',
      },
      {
        type: 'condition',
        version: 1,
        label: 'Conditie (If/Else)',
        icon: 'i-lucide-git-branch',
        category: 'logic',
        color: '#f97316',
        description:
          'Ramifica workflow-ul pe baza conditiilor.',
        defaults: {
          conditions: [],
          combinator: 'and',
        },
        configFields: [
          {
            key: 'conditions',
            label: 'Conditii',
            type: 'condition-editor',
            required: true,
          },
        ],
        beforePolicy: 'all',
        outputKind: 'value',
      },
      ...documentNodes,
      {
        type: 'notification',
        version: 1,
        label: 'Trimite Notificare',
        icon: 'i-lucide-bell',
        category: 'action',
        color: '#6366f1',
        description:
          'Trimite o notificare in aplicatie.',
        defaults: {
          recipient: null,
          subjectTokens: [],
          contentTokens: [],
          targetSourceNodeId: '',
        },
        configFields: [
          {
            key: 'recipient',
            label: 'Destinatar',
            type: 'notification-recipient',
            required: true,
          },
          {
            key: 'subjectTokens',
            label: 'Subiect',
            type: 'text-template',
            required: true,
          },
          {
            key: 'contentTokens',
            label: 'Continut',
            type: 'text-template',
            required: true,
          },
          {
            key: 'targetSourceNodeId',
            label: 'Record tinta',
            type: 'data-source-select',
          },
        ],
        beforePolicy: 'none',
        outputKind: 'value',
      },
      {
        type: 'for_each',
        version: 1,
        label: 'Pentru Fiecare',
        icon: 'i-lucide-repeat-2',
        category: 'logic',
        color: '#14b8a6',
        description:
          'Ruleaza ramura pentru fiecare element dintr-o lista.',
        defaults: { sourceNodeId: '' },
        configFields: [
          {
            key: 'sourceNodeId',
            label: 'Lista de inregistrari',
            type: 'list-source-select',
            required: true,
          },
        ],
        beforePolicy: 'none',
        outputKind: 'record',
      },
      {
        type: 'validate',
        version: 1,
        label: 'Validare',
        icon: 'i-lucide-shield-check',
        category: 'logic',
        color: '#f59e0b',
        description:
          'Opreste workflow-ul cand conditia de eroare este adevarata.',
        defaults: {
          conditions: [],
          combinator: 'and',
          message: '',
        },
        configFields: [
          {
            key: 'conditions',
            label: 'Conditii',
            type: 'condition-editor',
            required: true,
          },
          {
            key: 'message',
            label: 'Mesaj eroare',
            type: 'textarea',
            required: true,
          },
        ],
        beforePolicy: 'all',
        outputKind: 'value',
      },
      {
        type: 'stop_error',
        version: 1,
        label: 'Stop cu Eroare',
        icon: 'i-lucide-octagon-x',
        category: 'logic',
        color: '#ef4444',
        description:
          'Opreste workflow-ul cu o eroare.',
        defaults: { message: '' },
        configFields: [
          {
            key: 'message',
            label: 'Mesaj eroare',
            type: 'textarea',
            required: true,
          },
        ],
        beforePolicy: 'all',
        outputKind: 'value',
      },
      {
        type: 'http_request',
        version: 1,
        label: 'HTTP Request',
        icon: 'i-lucide-globe',
        category: 'integration',
        color: '#06b6d4',
        description:
          'Trimite o cerere catre un domeniu aprobat.',
        defaults: {
          method: 'GET',
          url: '',
          body: '',
        },
        configFields: [
          {
            key: 'method',
            label: 'Metoda',
            type: 'select',
            options: [
              'GET',
              'POST',
              'PUT',
              'DELETE',
            ].map((value) => ({
              label: value,
              value,
            })),
          },
          {
            key: 'url',
            label: 'URL',
            type: 'text',
            required: true,
          },
          {
            key: 'body',
            label: 'Body (JSON)',
            type: 'textarea',
          },
        ],
        beforePolicy: 'none',
        outputKind: 'value',
      },
      {
        type: 'set_data',
        version: 1,
        label: 'Set/Calculeaza',
        icon: 'i-lucide-calculator',
        category: 'action',
        color: '#ec4899',
        description:
          'Seteaza campuri si calculeaza formule.',
        defaults: { assignments: [] },
        configFields: [
          {
            key: 'assignments',
            label: 'Valori de setat',
            type: 'formula-assignments',
          },
        ],
        beforePolicy: 'insert-update',
        outputKind: 'record',
      },
    ];

  list(): WorkflowNodeDefinition[] {
    return this.definitions.map((definition) => ({
      ...definition,
      defaults: structuredClone(
        definition.defaults,
      ),
      configFields: structuredClone(
        definition.configFields,
      ),
    }));
  }

  get(
    type: string,
  ): WorkflowNodeDefinition | undefined {
    const normalized = [
      'trigger',
      'webhook_trigger',
    ].includes(type)
      ? 'start'
      : type;
    return this.definitions.find(
      (definition) =>
        definition.type === normalized,
    );
  }
}
