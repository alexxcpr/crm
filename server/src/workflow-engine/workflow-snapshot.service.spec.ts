import { WorkflowSnapshotService } from './workflow-snapshot.service';

describe('WorkflowSnapshotService', () => {
  it('mascheaza recursiv cheile sensibile', () => {
    const service = new WorkflowSnapshotService();
    expect(
      service.sanitize({
        password: 'secret',
        nested: {
          authorization: 'Bearer token',
          apiKey: 'key',
          safe: 'visible',
        },
      }),
    ).toEqual({
      password: '[REDACTED]',
      nested: {
        authorization: '[REDACTED]',
        apiKey: '[REDACTED]',
        safe: 'visible',
      },
    });
  });

  it('limiteaza snapshoturile mari', () => {
    const service = new WorkflowSnapshotService();
    expect(
      service.sanitize({
        value: 'x'.repeat(300 * 1024),
      }),
    ).toEqual(
      expect.objectContaining({
        truncated: true,
      }),
    );
  });
});
