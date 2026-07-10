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

function makeExecutableService(workflow: Record<string, any>) {
  const first = jest.fn().mockResolvedValue(workflow);
  const where = jest.fn().mockReturnValue({ first });
  const knex = jest.fn().mockReturnValue({ where });
  const n8nClient = {
    activateWorkflow: jest.fn(),
    executeWebhook: jest.fn().mockResolvedValue({ ok: true }),
  };
  const service = new WorkflowSyncService(
    n8nClient as any,
    {
      isAvailable: true,
      slug: 'tenant',
      dbName: 'tenant_db',
      knex,
    } as any,
    {
      get: jest.fn((_key: string, fallback: string) => fallback),
    } as any,
    {
      signAsync: jest.fn().mockResolvedValue('workflow-token'),
    } as any,
  );

  return { service, n8nClient };
}

describe('WorkflowSyncService validation nodes', () => {
  it('executa workflow-ul sincronizat fara sync sau activare inainte de rulare', async () => {
    const { service, n8nClient } = makeExecutableService({
      id_workflow: 'wf-id',
      slug: 'actualizare-contacte',
      n8n_workflow_id: 'n8n-id',
      nodes: [{ id: 'start', type: 'start', parameters: { entity: 'contacts' } }],
      connections: [],
    });
    const syncSpy = jest.spyOn(service, 'syncWorkflow');

    await service.executeWorkflow('wf-id', {
      userId: 'user-id',
      profileId: 'profile-id',
    });

    expect(syncSpy).not.toHaveBeenCalled();
    expect(n8nClient.activateWorkflow).not.toHaveBeenCalled();
    expect(n8nClient.executeWebhook).toHaveBeenCalledWith(
      'crm-tenant-actualizare-contacte',
      expect.objectContaining({ workflowToken: 'workflow-token' }),
      'n8n-id',
    );
  });

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

  it('trimite limit=all pentru app_get_record fara limita configurata', () => {
    const service = makeService();
    const workflow = {
      name: 'Toate contactele',
      slug: 'toate_contactele',
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
          parameters: { entity: 'contacts', filters: [] },
        },
      ],
      connections: [{ source: 'start', target: 'fetch_contacts' }],
    };

    const translated = (service as any).translateToN8n(workflow);
    const fetchNode = translated.nodes.find((node: any) => node.id === 'fetch_contacts');

    expect(fetchNode.parameters.queryParameters.parameters).toContainEqual({
      name: 'limit',
      value: 'all',
    });
  });

  it('citeaza literalurile text din formulele set_data', () => {
    const service = makeService();
    const workflow = {
      name: 'Search name',
      slug: 'search_name',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'crm_contact' },
        },
        {
          id: 'company',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'crm_company', filters: [] },
        },
        {
          id: 'set_search',
          type: 'set_data',
          position: { x: 500, y: 0 },
          parameters: {
            assignments: [
              {
                key: 'search_name',
                tokens: [
                  { type: 'field', sourceNodeId: 'start', fieldSlug: 'cf_nume' },
                  { type: 'operator', value: '+' },
                  { type: 'literal', value: ' - ' },
                  { type: 'operator', value: '+' },
                  { type: 'field', sourceNodeId: 'company', fieldSlug: 'cf_denumire' },
                ],
              },
            ],
          },
        },
      ],
      connections: [
        { source: 'start', target: 'company' },
        { source: 'company', target: 'set_search' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const setNode = translated.nodes.find((node: any) => node.id === 'set_search');

    expect(setNode.parameters.values.string).toContainEqual({
      name: 'search_name',
      value:
        `={{$('start').first().json.body.record.cf_nume + " - " + $('company').first().json.data.cf_denumire}}`,
    });
  });

  it('converteste campurile numerice din formulele set_data in numere', () => {
    const service = makeService();
    const workflow = {
      name: 'Sold',
      slug: 'sold',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'venit' },
        },
        {
          id: 'sold',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'sold', filters: [], limit: 1 },
        },
        {
          id: 'calc_sold',
          type: 'set_data',
          position: { x: 500, y: 0 },
          parameters: {
            assignments: [
              {
                key: 'cf_sold',
                tokens: [
                  { type: 'field', sourceNodeId: 'sold', fieldSlug: 'cf_sold', dataType: 'numeric' },
                  { type: 'operator', value: '+' },
                  { type: 'field', sourceNodeId: 'start', fieldSlug: 'cf_suma', dataType: 'numeric' },
                ],
              },
            ],
          },
        },
      ],
      connections: [
        { source: 'start', target: 'sold' },
        { source: 'sold', target: 'calc_sold' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const setNode = translated.nodes.find((node: any) => node.id === 'calc_sold');

    expect(setNode.parameters.values.string).toContainEqual({
      name: 'cf_sold',
      value:
        `={{Number($('sold').first().json.data.cf_sold ?? 0) + Number($('start').first().json.body.record.cf_suma ?? 0)}}`,
    });
  });

  it('formateaza campurile decimal cu doua zecimale in formule text', () => {
    const service = makeService();
    const workflow = {
      name: 'Mesaj sold',
      slug: 'mesaj_sold',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'cheltuiala' },
        },
        {
          id: 'sold',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'sold', filters: [], limit: 1 },
        },
        {
          id: 'message',
          type: 'set_data',
          position: { x: 500, y: 0 },
          parameters: {
            assignments: [
              {
                key: 'mesaj',
                tokens: [
                  { type: 'literal', value: 'Soldul este ' },
                  { type: 'operator', value: '+' },
                  { type: 'field', sourceNodeId: 'sold', fieldSlug: 'cf_sold', dataType: 'numeric' },
                  { type: 'operator', value: '+' },
                  { type: 'literal', value: ' lei. Cheltuieli totale pentru luna: ' },
                  { type: 'operator', value: '+' },
                  { type: 'field', sourceNodeId: 'start', fieldSlug: 'cf_luna', dataType: 'varchar' },
                ],
              },
            ],
          },
        },
      ],
      connections: [
        { source: 'start', target: 'sold' },
        { source: 'sold', target: 'message' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const setNode = translated.nodes.find((node: any) => node.id === 'message');

    expect(setNode.parameters.values.string).toContainEqual({
      name: 'mesaj',
      value:
        `={{"Soldul este " + Number($('sold').first().json.data.cf_sold ?? 0).toFixed(2) + " lei. Cheltuieli totale pentru luna: " + $('start').first().json.body.record.cf_luna}}`,
    });
  });

  it('genereaza filtre null-safe cand valoarea vine dintr-un nod care poate intoarce data null', () => {
    const service = makeService();
    const workflow = {
      name: 'Activitate companie',
      slug: 'activitate_companie',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'crm_activitate' },
        },
        {
          id: 'contact',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: {
            entity: 'crm_contact',
            limit: 1,
            filters: [
              {
                field: 'id',
                operator: 'eq',
                valueSource: {
                  sourceType: 'node_output',
                  sourceNodeId: 'start',
                  sourceFieldSlug: 'cf_contact',
                },
              },
            ],
          },
        },
        {
          id: 'company',
          type: 'app_get_record',
          position: { x: 500, y: 0 },
          parameters: {
            entity: 'crm_companie',
            limit: 1,
            filters: [
              {
                field: 'id',
                operator: 'eq',
                valueSource: {
                  sourceType: 'node_output',
                  sourceNodeId: 'contact',
                  sourceFieldSlug: 'cf_companie',
                },
              },
            ],
          },
        },
      ],
      connections: [
        { source: 'start', target: 'contact' },
        { source: 'contact', target: 'company' },
      ],
    };

    const translated = (service as any).translateToN8n(workflow);
    const companyNode = translated.nodes.find((node: any) => node.id === 'company');

    expect(companyNode.parameters.queryParameters.parameters).toContainEqual({
      name: 'filter[id][eq]',
      value: `={{$('contact').first().json.data?.cf_companie ?? "__MODUVIS_EMPTY_FILTER__"}}`,
    });
  });

  it('trimite tenantul curent in headerele requesturilor CRM generate pentru n8n', () => {
    const service = makeService();
    const workflow = {
      name: 'Transfer',
      slug: 'transfer',
      nodes: [
        {
          id: 'start',
          type: 'start',
          position: { x: 0, y: 0 },
          parameters: { entity: 'geo_unit' },
        },
        {
          id: 'fetch_judete',
          type: 'app_get_record',
          position: { x: 250, y: 0 },
          parameters: { entity: 'judete', limit: 100, filters: [] },
        },
      ],
      connections: [{ source: 'start', target: 'fetch_judete' }],
    };

    const translated = (service as any).translateToN8n(workflow);
    const fetchNode = translated.nodes.find((node: any) => node.id === 'fetch_judete');

    expect(fetchNode.parameters.headerParameters.parameters).toContainEqual({
      name: 'x-tenant',
      value: 'tenant',
    });
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
