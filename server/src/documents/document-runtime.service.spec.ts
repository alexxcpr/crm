import {
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DocumentRuntimeService } from './document-runtime.service';
import type {
  DocumentExecuteRequest,
  DocumentHandle,
} from './document.types';
import { PdfDocumentAdapter } from './pdf-document.adapter';
import { WordDocumentAdapter } from './word-document.adapter';

function makeService() {
  return new DocumentRuntimeService(
    { slug: 'tenant' } as any,
    {
      get: jest.fn(
        (_key: string, fallback: string) =>
          fallback,
      ),
    } as any,
    {} as any,
    new WordDocumentAdapter({} as any),
    new PdfDocumentAdapter(),
    {} as any,
  );
}

const actor = {
  profileId:
    '11111111-1111-4111-a111-111111111111',
} as any;
const request: DocumentExecuteRequest = {
  package: 'word',
  operation: 'replaceText',
  executionId: 'execution-1',
  idempotencyKey: 'execution-1:replace:0:0',
};
const handle: DocumentHandle = {
  sessionId:
    '22222222-2222-4222-a222-222222222222',
  package: 'word',
  revision: 2,
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  fileName: 'template.docx',
  expiresAt: new Date(
    Date.now() + 60_000,
  ).toISOString(),
};

describe('DocumentRuntimeService session isolation', () => {
  it('accepts only the current revision from the same execution and profile', () => {
    const service = makeService();
    expect(() =>
      (service as any).validateSession(
        {
          id_session: handle.sessionId,
          status: 'active',
          expires_at: handle.expiresAt,
          execution_id: request.executionId,
          id_owner_profile: actor.profileId,
          package: 'word',
          current_revision: 2,
        },
        handle,
        request,
        actor,
      ),
    ).not.toThrow();
  });

  it('rejects stale revisions and expired handles', () => {
    const service = makeService();
    const session = {
      status: 'active',
      expires_at: handle.expiresAt,
      execution_id: request.executionId,
      id_owner_profile: actor.profileId,
      package: 'word',
      current_revision: 3,
    };
    expect(() =>
      (service as any).validateSession(
        session,
        handle,
        request,
        actor,
      ),
    ).toThrow(ConflictException);

    expect(() =>
      (service as any).validateSession(
        {
          ...session,
          current_revision: 2,
          expires_at: new Date(
            Date.now() - 1_000,
          ),
        },
        handle,
        request,
        actor,
      ),
    ).toThrow(ConflictException);
  });

  it('does not disclose sessions across profiles or executions', () => {
    const service = makeService();
    const session = {
      status: 'active',
      expires_at: handle.expiresAt,
      execution_id: 'other-execution',
      id_owner_profile: actor.profileId,
      package: 'word',
      current_revision: 2,
    };
    expect(() =>
      (service as any).validateSession(
        session,
        handle,
        request,
        actor,
      ),
    ).toThrow(NotFoundException);
    expect(() =>
      (service as any).validateSession(
        {
          ...session,
          execution_id: request.executionId,
          id_owner_profile: 'other-profile',
        },
        handle,
        request,
        actor,
      ),
    ).toThrow(NotFoundException);
  });

  it('derives a stable UUID idempotency key for persistent versions', () => {
    const service = makeService();
    const first = (
      service as any
    ).storageIdempotency(request, 'save');
    const second = (
      service as any
    ).storageIdempotency(request, 'save');
    expect(first).toBe(second);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('forces the file extension to match the document package', () => {
    const service = makeService();
    const normalize = (
      service as any
    ).normalizeFileNameForPackage.bind(service);

    expect(
      normalize('contract.docx', 'pdf'),
    ).toBe('contract.pdf');
    expect(normalize('contract.PDF', 'pdf')).toBe(
      'contract.pdf',
    );
    expect(
      normalize('folder/template.pdf', 'pdf'),
    ).toBe('template.pdf');
    expect(normalize('result.pdf', 'word')).toBe(
      'result.docx',
    );
  });
});
