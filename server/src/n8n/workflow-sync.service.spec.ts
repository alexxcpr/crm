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
});
