import { BadRequestException } from '@nestjs/common';
import { WorkflowNodeExecutorService } from './workflow-node-executor.service';

function createExecutor() {
  const data = {
    update: jest.fn(),
  };
  const first = jest
    .fn()
    .mockResolvedValue({ slug: 'contacts' });
  const where = jest.fn(() => ({ first }));
  const knex = jest.fn(() => ({ where }));
  const documents = {
    execute: jest.fn().mockResolvedValue({
      data: {
        document_handle: {
          id: 'document-1',
        },
      },
    }),
  };
  const service = new WorkflowNodeExecutorService(
    data as any,
    {} as any,
    {} as any,
    documents as any,
    {} as any,
    { knex } as any,
  );

  return { service, data, where, documents };
}

function executionInput(
  startRecordId: string,
): any {
  const record = {
    id: 'record-1',
    cf_status: 'draft',
  };
  return {
    context: {
      executionId: 'execution-1',
      workflowId: 'workflow-1',
      revisionId: 'revision-1',
      trigger: 'entity.before_update',
      entitySlug: 'contacts',
      entityId: 'entity-1',
      recordId: 'record-1',
      record,
      actor: {},
      deadlineAt: Date.now() + 60_000,
      signal: new AbortController().signal,
      nodeRunCount: 0,
      outputs: new Map([
        [
          'start',
          [
            {
              nodeId: 'start',
              runIndex: 0,
              itemIndex: 0,
              value: {
                id: startRecordId,
              },
            },
          ],
        ],
      ]),
    } as any,
    node: {
      id: 'update',
      type: 'app_update_record',
      version: 1,
      config: {
        entityId: 'entity-1',
        entity: 'contacts',
        recordIdSource: {
          sourceType: 'node_output',
          sourceNodeId: 'start',
          sourceFieldSlug: 'id',
        },
        fieldMappings: [
          {
            key: 'cf_status',
            sourceType: 'static',
            value: 'approved',
          },
        ],
      },
    },
    token: {
      itemIndex: 0,
      current: record,
      sourceNodeId: 'start',
    },
    runIndex: 0,
  };
}

describe('WorkflowNodeExecutorService', () => {
  it('aplica patch-ul before_update cand ID-ul din START este recordul curent', async () => {
    const { service, data, where } =
      createExecutor();
    const input = executionInput('record-1');

    const output = await service.execute(input);

    expect(output.cf_status).toBe('approved');
    expect(input.context.record.cf_status).toBe(
      'approved',
    );
    expect(data.update).not.toHaveBeenCalled();
    expect(where).toHaveBeenCalledWith(
      'id_entity',
      'entity-1',
    );
  });

  it('respinge un ID diferit in before_update', async () => {
    const { service, data } = createExecutor();

    await expect(
      service.execute(executionInput('record-2')),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(data.update).not.toHaveBeenCalled();
  });

  it('formateaza data si expune ambele variante', async () => {
    const { service } = createExecutor();
    const input = executionInput('record-1');
    input.context.outputs.get('start')![0].value.date_created =
      '2026-07-19T12:56:40.000Z';
    input.node = {
      id: 'format-date',
      type: 'format_date',
      version: 1,
      config: {
        source: {
          sourceType: 'node_output',
          sourceNodeId: 'start',
          sourceFieldSlug: 'date_created',
        },
        preset: 'ro_numeric',
      },
    };

    await expect(
      service.execute(input),
    ).resolves.toEqual({
      date: '19.07.2026',
      datetime: '19.07.2026 15:56',
    });
  });

  it.each([null, '', 'data-invalida'])(
    'respinge data lipsa sau invalida %p',
    async (value) => {
      const { service } = createExecutor();
      const input = executionInput('record-1');
      input.context.outputs.get('start')![0].value.date_created =
        value;
      input.node = {
        id: 'format-date',
        type: 'format_date',
        version: 1,
        config: {
          source: {
            sourceType: 'node_output',
            sourceNodeId: 'start',
            sourceFieldSlug: 'date_created',
          },
          preset: 'ro_numeric',
        },
      };

      await expect(
        service.execute(input),
      ).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );

  it('foloseste outputul formatat in Word Replace', async () => {
    const { service, documents } =
      createExecutor();
    const input = executionInput('record-1');
    input.context.outputs.set(
      'format-date',
      [
        {
          nodeId: 'format-date',
          runIndex: 0,
          itemIndex: 0,
          value: {
            date: '19.07.2026',
            datetime:
              '19.07.2026 15:56',
          },
        },
      ],
    );
    input.context.outputs.set('word-open', [
      {
        nodeId: 'word-open',
        runIndex: 0,
        itemIndex: 0,
        value: {
          document_handle: {
            id: 'document-1',
          },
        },
      },
    ]);
    input.node = {
      id: 'word-replace',
      type: 'word_replace_text',
      version: 1,
      config: {
        documentSourceNodeId: 'word-open',
        search: {
          sourceType: 'static',
          value: '{{date_created}}',
        },
        replace: {
          sourceType: 'node_output',
          sourceNodeId: 'format-date',
          sourceFieldSlug: 'datetime',
        },
      },
    };

    await service.execute(input);

    expect(
      documents.execute,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        args: {
          search: '{{date_created}}',
          replace:
            '19.07.2026 15:56',
        },
      }),
      input.context.actor,
    );
  });
});
