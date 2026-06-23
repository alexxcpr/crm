import { WorkflowSyncService } from './workflow-sync.service';

function makeService() {
  return new WorkflowSyncService(
    {} as any,
    {
      isAvailable: true,
      slug: 'tenant',
      dbName: 'tenant_db',
      knex: jest.fn(),
    } as any,
    {
      get: jest.fn((_key: string, fallback: string) => fallback),
    } as any,
    {} as any,
  );
}

describe('WorkflowSyncService validation nodes', () => {
  it('traduce stop_error in stopAndError cu mesaj prefixat', () => {
    const service = makeService();
    const workflow = {
      name: 'Validari',
      slug: 'validari',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'contacts' },
        },
        {
          id: 'stop',
          type: 'stop_error',
          position: { x: 250, y: 0 },
          parameters: { message: 'Camp obligatoriu' },
        },
      ],
      connections: [{ source: 'start', target: 'stop' }],
    };

    const translated = (service as any).translateToN8n(workflow);
    const stopNode = translated.nodes.find((node: any) => node.id === 'stop');

    expect(stopNode).toMatchObject({
      type: 'n8n-nodes-base.stopAndError',
      parameters: {
        errorType: 'errorMessage',
        errorMessage: '[MODUVIS_VALIDATION] Camp obligatoriu',
      },
    });
  });

  it('expandeaza validate in IF plus stopAndError sintetic pe ramura true', () => {
    const service = makeService();
    const workflow = {
      name: 'Validari',
      slug: 'validari',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'contacts' },
        },
        {
          id: 'validate',
          type: 'validate',
          position: { x: 250, y: 0 },
          parameters: {
            combinator: 'and',
            message: 'Buget invalid',
            conditions: [
              {
                leftOperand: {
                  sourceType: 'node_output',
                  sourceNodeId: 'start',
                  fieldSlug: 'cf_budget',
                  dataType: 'numeric',
                },
                operator: 'larger',
                rightOperand: { sourceType: 'static', value: '0' },
              },
            ],
          },
        },
        {
          id: 'next',
          type: 'set_data',
          position: { x: 500, y: 0 },
          parameters: { assignments: [] },
        },
      ],
      connections: [
        { source: 'start', target: 'validate' },
        { source: 'validate', target: 'next' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const validateNode = translated.nodes.find((node: any) => node.id === 'validate');
    const errorNode = translated.nodes.find(
      (node: any) => node.id === 'validate__validation_error',
    );

    expect(validateNode.type).toBe('n8n-nodes-base.if');
    expect(errorNode).toMatchObject({
      type: 'n8n-nodes-base.stopAndError',
      parameters: {
        errorType: 'errorMessage',
        errorMessage: '[MODUVIS_VALIDATION] Buget invalid',
      },
    });
    expect(translated.connections.validate.main[0]).toEqual([
      { node: 'validate__validation_error', type: 'main', index: 0 },
    ]);
    expect(translated.connections.validate.main[1]).toEqual([
      { node: 'next', type: 'main', index: 0 },
    ]);
  });

  it('traduce for_each in Code node care expandeaza lista in item-uri', () => {
    const service = makeService();
    const workflow = {
      name: 'Iterare',
      slug: 'iterare',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'contacts' },
        },
        {
          id: 'fetch_contacts',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'contacts', limit: 5000, filters: [] },
        },
        {
          id: 'each_contact',
          type: 'for_each',
          position: { x: 500, y: 0 },
          parameters: { sourceNodeId: 'fetch_contacts' },
        },
      ],
      connections: [
        { source: 'start', target: 'fetch_contacts' },
        { source: 'fetch_contacts', target: 'each_contact' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const forEachNode = translated.nodes.find((node: any) => node.id === 'each_contact');

    expect(forEachNode).toMatchObject({
      type: 'n8n-nodes-base.code',
      parameters: {
        jsCode: expect.stringContaining('records.map((record, index)'),
      },
    });
    expect(forEachNode.parameters.jsCode).toContain('throw new Error');
    expect(forEachNode.parameters.jsCode).toContain('_foreach_index');
  });

  it('foloseste item-ul curent pentru nodurile din interiorul for_each', () => {
    const service = makeService();
    const workflow = {
      name: 'Iterare',
      slug: 'iterare',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'contacts' },
        },
        {
          id: 'fetch_contacts',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'contacts', limit: 5000, filters: [] },
        },
        {
          id: 'each_contact',
          type: 'for_each',
          position: { x: 500, y: 0 },
          parameters: { sourceNodeId: 'fetch_contacts' },
        },
        {
          id: 'validate_contact',
          type: 'validate',
          position: { x: 750, y: 0 },
          parameters: {
            combinator: 'and',
            message: 'Email lipsa',
            conditions: [
              {
                leftOperand: {
                  sourceType: 'node_output',
                  sourceNodeId: 'each_contact',
                  fieldSlug: 'cf_email',
                  dataType: 'varchar',
                },
                operator: 'isNull',
              },
            ],
          },
        },
        {
          id: 'update_contact',
          type: 'app_update_record',
          position: { x: 1000, y: 0 },
          parameters: {
            entity: 'contacts',
            recordIdSource: {
              sourceType: 'node_output',
              sourceNodeId: 'each_contact',
              sourceFieldSlug: 'id',
              value: 'id',
            },
            fieldMappings: [
              {
                key: 'cf_status',
                sourceType: 'node_output',
                sourceNodeId: 'each_contact',
                sourceFieldSlug: 'cf_status',
                value: '',
              },
            ],
          },
        },
      ],
      connections: [
        { source: 'start', target: 'fetch_contacts' },
        { source: 'fetch_contacts', target: 'each_contact' },
        { source: 'each_contact', target: 'validate_contact' },
        { source: 'validate_contact', target: 'update_contact' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const validateNode = translated.nodes.find((node: any) => node.id === 'validate_contact');
    const updateNode = translated.nodes.find((node: any) => node.id === 'update_contact');

    expect(validateNode.parameters.conditions.string[0].value1).toBe(
      "={{$('each_contact').item.json.cf_email}}",
    );
    expect(updateNode.parameters.queryParameters.parameters).toContainEqual({
      name: 'id',
      value: "={{$('each_contact').item.json.id}}",
    });
    expect(updateNode.parameters.bodyParameters.parameters).toContainEqual({
      name: 'cf_status',
      value: "={{$('each_contact').item.json.cf_status}}",
    });
  });
});
