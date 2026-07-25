import { migrationErrors } from '../../migrations/tenant/20260725000001_native_workflow_engine';

describe('migrarea workflow-urilor legacy', () => {
  it('accepta fixture-ul cu nodurile native v1 si normalizeaza graful valid', () => {
    const nodes = [
      {
        id: 'start',
        type: 'trigger',
        parameters: { entity: 'orders' },
      },
      {
        id: 'profile',
        type: 'system_get_current_profile',
        parameters: {},
      },
      {
        id: 'get',
        type: 'app_get_record',
        parameters: {
          entity: 'orders',
          limit: null,
        },
      },
      {
        id: 'related',
        type: 'app_get_related',
        parameters: {
          sourceNodeId: 'get',
          relationField: 'customer',
        },
      },
      {
        id: 'create',
        type: 'app_create_record',
        parameters: { entity: 'orders' },
      },
      {
        id: 'update',
        type: 'app_update_record',
        parameters: { entity: 'orders' },
      },
      {
        id: 'mail',
        type: 'email',
        parameters: {
          integrationId: 'smtp',
          to: 'client@example.com',
          subject: 'Subiect',
          content: 'Continut',
        },
      },
      {
        id: 'condition',
        type: 'condition',
        parameters: {},
      },
      {
        id: 'notification',
        type: 'notification',
        parameters: {
          recipient: { profileId: 'profile' },
          subjectTokens: [
            { type: 'literal', value: 'Subiect' },
          ],
          contentTokens: [
            {
              type: 'literal',
              value: 'Continut',
            },
          ],
        },
      },
      {
        id: 'foreach',
        type: 'for_each',
        parameters: { sourceNodeId: 'get' },
      },
      {
        id: 'validate',
        type: 'validate',
        parameters: {
          conditions: [{ operator: 'equals' }],
          message: 'Invalid',
        },
      },
      {
        id: 'set',
        type: 'set_data',
        parameters: {},
      },
      {
        id: 'word-open',
        type: 'word_open',
        parameters: { fileId: 'file' },
      },
      {
        id: 'word-replace',
        type: 'word_replace_text',
        parameters: {
          documentSourceNodeId: 'word-open',
          search: 'x',
          replace: 'y',
        },
      },
      {
        id: 'word-create-rows',
        type: 'word_create_table_rows',
        parameters: {
          documentSourceNodeId: 'word-replace',
          search: 'row',
          nrOfNewRows: 2,
        },
      },
      {
        id: 'word-insert-rows',
        type: 'word_insert_table_rows',
        parameters: {
          documentSourceNodeId:
            'word-create-rows',
          search: 'row',
          nrOfNewRows: 2,
        },
      },
      {
        id: 'word-pdf',
        type: 'word_convert_to_pdf',
        parameters: {
          documentSourceNodeId:
            'word-insert-rows',
        },
      },
      {
        id: 'pdf-save',
        type: 'pdf_save',
        parameters: {
          documentSourceNodeId: 'word-pdf',
        },
      },
      {
        id: 'pdf-open',
        type: 'pdf_open',
        parameters: { fileId: 'file' },
      },
      {
        id: 'pdf-update',
        type: 'pdf_update',
        parameters: {
          documentSourceNodeId: 'pdf-open',
          fileId: 'file',
        },
      },
      {
        id: 'word-save',
        type: 'word_save',
        parameters: {
          documentSourceNodeId:
            'word-insert-rows',
          fileName: 'document.docx',
        },
      },
      {
        id: 'word-update',
        type: 'word_update',
        parameters: {
          documentSourceNodeId: 'word-save',
          fileId: 'file',
        },
      },
      {
        id: 'stop',
        type: 'stop_error',
        parameters: { message: 'Stop' },
      },
    ];
    const connections = nodes
      .slice(1)
      .map((node, index) => ({
        source: nodes[index].id,
        target: node.id,
        ...(nodes[index].type === 'condition'
          ? { sourceHandle: 'true' }
          : {}),
      }));

    expect(
      migrationErrors(nodes, connections, []),
    ).toEqual([]);
  });

  it.each([
    ['delay', 'unsupported_delay'],
    ['code', 'unsupported_code'],
    ['http_request', 'http_domain_not_allowed'],
  ])(
    'pastreaza dar marcheaza incompatibil nodul %s',
    (type, code) => {
      const parameters =
        type === 'http_request'
          ? { url: 'https://api.example.com' }
          : {};
      const errors = migrationErrors(
        [
          {
            id: 'start',
            type: 'start',
            parameters: { entity: 'orders' },
          },
          { id: 'legacy', type, parameters },
        ],
        [{ source: 'start', target: 'legacy' }],
        [],
      );

      expect(
        errors.map((error) => error.code),
      ).toContain(code);
    },
  );
});
