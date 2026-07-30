import { WorkflowCompilerService } from './workflow-compiler.service';

describe('WorkflowCompilerService schedule context', () => {
  const service = Object.create(
    WorkflowCompilerService.prototype,
  ) as WorkflowCompilerService;

  function validate(nodes: any[]) {
    const errors: any[] = [];
    (service as any).validateScheduleContext(
      nodes,
      errors,
    );
    return errors;
  }

  it('refuza actualizarea fara ID explicit', () => {
    const errors = validate([
      {
        id: 'update',
        type: 'app_update_record',
        parameters: {},
      },
    ]);
    expect(errors).toEqual([
      expect.objectContaining({
        code: 'schedule_record_context_required',
        nodeId: 'update',
      }),
    ]);
  });

  it('accepta actualizarea cu ID dintr-un nod anterior', () => {
    expect(
      validate([
        {
          id: 'update',
          type: 'app_update_record',
          parameters: {
            recordIdSource: {
              sourceNodeId: 'search',
            },
          },
        },
      ]),
    ).toEqual([]);
  });

  it('refuza citirea relatiei fara sursa explicita', () => {
    const errors = validate([
      {
        id: 'related',
        type: 'app_get_related',
        parameters: {},
      },
    ]);
    expect(errors[0]).toEqual(
      expect.objectContaining({
        code: 'schedule_record_context_required',
        nodeId: 'related',
      }),
    );
  });
});
