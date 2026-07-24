import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';
import type { AuthenticatedUser } from 'src/security/security.types';
import { FileStorageService } from 'src/storage/file-storage.service';
import { STORAGE_PROVIDER } from 'src/storage/storage.constants';
import type { StorageProvider } from 'src/storage/storage.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import type {
  DocumentExecuteData,
  DocumentExecuteRequest,
  DocumentHandle,
  DocumentPackageAdapter,
} from './document.types';
import { WordDocumentAdapter } from './word-document.adapter';

const DEFAULT_DOCUMENT_TTL_SECONDS = 86_400;
const DEFAULT_MAX_DOCUMENT_BYTES = 25_000_000;
const DEFAULT_MAX_ACTIVE_SESSIONS = 100;

@Injectable()
export class DocumentRuntimeService {
  private readonly adapters: Map<
    string,
    DocumentPackageAdapter
  >;

  constructor(
    private readonly tenantContext: TenantContext,
    private readonly config: ConfigService,
    private readonly files: FileStorageService,
    word: WordDocumentAdapter,
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider,
  ) {
    this.adapters = new Map([
      [word.package, word],
    ]);
  }

  async execute(
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
  ): Promise<{ data: DocumentExecuteData }> {
    this.validateRequest(request);
    const existing = await this.findOperation(
      request,
      actor,
    );
    if (
      existing?.status === 'completed' &&
      existing.response
    ) {
      return this.parseResponse(
        existing.response,
      );
    }
    if (existing) {
      throw new ConflictException(
        'Operatia documentului este deja in curs.',
      );
    }

    const adapter = this.adapters.get(
      request.package,
    );
    if (!adapter) {
      throw new BadRequestException(
        `Pachetul "${request.package}" nu este disponibil.`,
      );
    }
    if (request.operation === 'open') {
      return this.open(request, actor, adapter);
    }
    return this.executeOnSession(
      request,
      actor,
      adapter,
    );
  }

  async cleanupExpiredSessions(): Promise<number> {
    const sessions = await this.tenantContext
      .knex('workflow_document_session')
      .where({ status: 'active' })
      .where('expires_at', '<=', new Date())
      .limit(100);
    for (const session of sessions) {
      await this.deleteSessionObjects(
        session,
      ).catch(() => undefined);
      await this.tenantContext
        .knex('workflow_document_session')
        .where({ id_session: session.id_session })
        .update({
          status: 'expired',
          date_updated:
            this.tenantContext.knex.fn.now(),
        });
    }
    return sessions.length;
  }

  private async open(
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
    adapter: DocumentPackageAdapter,
  ): Promise<{ data: DocumentExecuteData }> {
    const fileId = this.requiredString(
      request.args?.id_file ??
        request.args?.fileId,
      'id_file',
    );
    const activeCount = await this.tenantContext
      .knex('workflow_document_session')
      .where({ status: 'active' })
      .where('expires_at', '>', new Date())
      .count('* as total')
      .first();
    if (
      Number(activeCount?.total ?? 0) >=
      this.maxActiveSessions
    ) {
      throw new ConflictException(
        'Tenantul a atins limita de sesiuni active pentru documente.',
      );
    }

    const source =
      await this.files.getFileBufferForWorkflow(
        fileId,
        actor,
      );
    if (
      !adapter.mimeTypes.includes(
        source.version.mime_type,
      )
    ) {
      throw new BadRequestException(
        'Fisierul nu este compatibil cu pachetul selectat.',
      );
    }
    this.validateSize(source.buffer);
    adapter.validate(source.buffer);

    const sessionId = randomUUID();
    const expiresAt = new Date(
      Date.now() + this.ttlSeconds * 1_000,
    );
    const extension = this.extensionFor(
      request.package,
    );
    const objectKey = this.objectKey(
      request.executionId,
      sessionId,
      0,
      extension,
    );
    await this.putTemporary(
      objectKey,
      source.buffer,
      source.version.mime_type,
    );

    const handle: DocumentHandle = {
      sessionId,
      package: request.package,
      revision: 0,
      mimeType: source.version.mime_type,
      fileName: source.version.file_name,
      expiresAt: expiresAt.toISOString(),
    };
    const response = {
      data: this.responseData(handle),
    };
    try {
      await this.tenantContext.knex.transaction(
        async (trx) => {
          await trx(
            'workflow_document_session',
          ).insert({
            id_session: sessionId,
            execution_id: request.executionId,
            package: request.package,
            current_revision: 0,
            current_object_key: objectKey,
            mime_type: handle.mimeType,
            file_name: handle.fileName,
            source_file_id: fileId,
            id_owner_profile: actor.profileId,
            status: 'active',
            expires_at: expiresAt,
          });
          await this.insertCompletedOperation(
            trx,
            request,
            actor,
            sessionId,
            null,
            0,
            response,
          );
        },
      );
      return response;
    } catch (error) {
      await this.provider
        .deleteObject(this.bucket, objectKey)
        .catch(() => undefined);
      const concurrent = await this.findOperation(
        request,
        actor,
      );
      if (
        concurrent?.status === 'completed' &&
        concurrent.response
      ) {
        return this.parseResponse(
          concurrent.response,
        );
      }
      throw error;
    }
  }

  private async executeOnSession(
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
    adapter: DocumentPackageAdapter,
  ): Promise<{ data: DocumentExecuteData }> {
    const anchor =
      request.document ?? request.documents?.[0];
    if (!anchor)
      throw new BadRequestException(
        'Documentul este obligatoriu.',
      );

    return this.tenantContext.knex.transaction(
      async (trx) => {
        const session = await trx(
          'workflow_document_session',
        )
          .where({ id_session: anchor.sessionId })
          .forUpdate()
          .first();
        this.validateSession(
          session,
          anchor,
          request,
          actor,
        );

        const concurrent = await trx(
          'workflow_document_operation',
        )
          .where({
            execution_id: request.executionId,
            id_owner_profile: actor.profileId,
            idempotency_key:
              request.idempotencyKey,
          })
          .first();
        if (
          concurrent?.status === 'completed' &&
          concurrent.response
        ) {
          return this.parseResponse(
            concurrent.response,
          );
        }
        if (concurrent)
          throw new ConflictException(
            'Operatia documentului este deja in curs.',
          );

        const [operation] = await trx(
          'workflow_document_operation',
        )
          .insert({
            id_session: session.id_session,
            execution_id: request.executionId,
            id_owner_profile: actor.profileId,
            idempotency_key:
              request.idempotencyKey,
            operation: request.operation,
            input_revision: anchor.revision,
            status: 'running',
          })
          .returning('*');

        const currentBuffer =
          await this.readTemporary(
            session.current_object_key,
            Number(session.current_revision),
          );
        const additionalBuffers: Buffer[] = [];
        for (const handle of request.documents ??
          []) {
          if (
            handle.sessionId === anchor.sessionId
          ) {
            additionalBuffers.push(currentBuffer);
            continue;
          }
          const additional = await trx(
            'workflow_document_session',
          )
            .where({
              id_session: handle.sessionId,
            })
            .first();
          this.validateSession(
            additional,
            handle,
            request,
            actor,
          );
          additionalBuffers.push(
            await this.readTemporary(
              additional.current_object_key,
              Number(additional.current_revision),
            ),
          );
        }

        let response: {
          data: DocumentExecuteData;
        };
        if (request.operation === 'save') {
          const file =
            await this.files.createGeneratedFile(
              {
                buffer: currentBuffer,
                fileName: this.requiredString(
                  request.args?.fileName,
                  'fileName',
                ),
                mimeType: session.mime_type,
                idempotencyKey:
                  this.storageIdempotency(
                    request,
                    'save',
                  ),
              },
              actor,
            );
          response = {
            data: this.responseData(
              this.handleFromSession(session),
              undefined,
              file,
            ),
          };
        } else if (
          request.operation === 'update'
        ) {
          const fileId = this.requiredString(
            request.args?.id_file ??
              request.args?.fileId ??
              session.source_file_id,
            'id_file',
          );
          const file =
            await this.files.updateGeneratedFile(
              fileId,
              {
                buffer: currentBuffer,
                fileName:
                  typeof request.args
                    ?.fileName === 'string' &&
                  request.args.fileName.length
                    ? request.args.fileName
                    : undefined,
                mimeType: session.mime_type,
                idempotencyKey:
                  this.storageIdempotency(
                    request,
                    'update',
                  ),
              },
              actor,
            );
          response = {
            data: this.responseData(
              this.handleFromSession(session),
              undefined,
              file,
            ),
          };
        } else {
          const result = await adapter.execute(
            request.operation,
            {
              document: currentBuffer,
              documents: additionalBuffers.length
                ? additionalBuffers
                : undefined,
              args: request.args ?? {},
            },
          );
          if (result.kind === 'value') {
            response = {
              data: this.responseData(
                this.handleFromSession(session),
                result.result,
              ),
            };
          } else if (
            result.kind === 'persistent-file'
          ) {
            this.validateSize(result.buffer);
            const file =
              await this.files.createGeneratedFile(
                {
                  buffer: result.buffer,
                  fileName: result.fileName,
                  mimeType: result.mimeType,
                  idempotencyKey:
                    this.storageIdempotency(
                      request,
                      `adapter-file:${request.operation}`,
                    ),
                },
                actor,
              );
            response = {
              data: this.responseData(
                this.handleFromSession(session),
                result.result,
                file,
              ),
            };
          } else if (
            result.kind === 'new-document'
          ) {
            this.validateSize(result.buffer);
            const outputPackage =
              result.package ?? request.package;
            const newSessionId = randomUUID();
            const newKey = this.objectKey(
              request.executionId,
              newSessionId,
              0,
              this.extensionFor(outputPackage),
            );
            await this.putTemporary(
              newKey,
              result.buffer,
              result.mimeType,
            );
            const expiresAt = new Date(
              Date.now() +
                this.ttlSeconds * 1_000,
            );
            await trx(
              'workflow_document_session',
            ).insert({
              id_session: newSessionId,
              execution_id: request.executionId,
              package: outputPackage,
              current_revision: 0,
              current_object_key: newKey,
              mime_type: result.mimeType,
              file_name: result.fileName,
              id_owner_profile: actor.profileId,
              status: 'active',
              expires_at: expiresAt,
            });
            const newHandle: DocumentHandle = {
              sessionId: newSessionId,
              package: outputPackage,
              revision: 0,
              mimeType: result.mimeType,
              fileName: result.fileName,
              expiresAt: expiresAt.toISOString(),
            };
            response = {
              data: this.responseData(
                newHandle,
                result.result,
              ),
            };
          } else {
            this.validateSize(result.buffer);
            const nextRevision =
              Number(session.current_revision) +
              1;
            const nextKey = this.objectKey(
              request.executionId,
              session.id_session,
              nextRevision,
              this.extensionFor(request.package),
            );
            await this.putTemporary(
              nextKey,
              result.buffer,
              session.mime_type,
            );
            const [updated] = await trx(
              'workflow_document_session',
            )
              .where({
                id_session: session.id_session,
                current_revision:
                  session.current_revision,
              })
              .update({
                current_revision: nextRevision,
                current_object_key: nextKey,
                date_updated: trx.fn.now(),
              })
              .returning('*');
            if (!updated)
              throw new ConflictException(
                'Documentul a fost modificat concurent.',
              );
            response = {
              data: this.responseData(
                this.handleFromSession(updated),
                result.result,
              ),
            };
          }
        }

        await trx('workflow_document_operation')
          .where({
            id_operation: operation.id_operation,
          })
          .update({
            output_revision:
              response.data.document.revision,
            response: JSON.stringify(response),
            status: 'completed',
            date_completed: trx.fn.now(),
          });
        return response;
      },
    );
  }

  private validateSession(
    session: any,
    handle: DocumentHandle,
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
  ): void {
    if (!session)
      throw new NotFoundException(
        'Sesiunea documentului nu exista.',
      );
    if (
      session.status !== 'active' ||
      new Date(session.expires_at).getTime() <=
        Date.now() ||
      new Date(handle.expiresAt).getTime() <=
        Date.now()
    ) {
      throw new ConflictException(
        'Sesiunea documentului a expirat.',
      );
    }
    if (
      session.execution_id !==
        request.executionId ||
      session.id_owner_profile !== actor.profileId
    ) {
      throw new NotFoundException(
        'Sesiunea documentului nu exista.',
      );
    }
    if (
      session.package !== request.package ||
      handle.package !== request.package
    ) {
      throw new BadRequestException(
        'Pachetul documentului nu corespunde nodului.',
      );
    }
    if (
      Number(session.current_revision) !==
      Number(handle.revision)
    ) {
      throw new ConflictException(
        'Handle-ul documentului foloseste o revizie veche.',
      );
    }
  }

  private async findOperation(
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
  ) {
    return this.tenantContext
      .knex('workflow_document_operation')
      .where({
        execution_id: request.executionId,
        id_owner_profile: actor.profileId,
        idempotency_key: request.idempotencyKey,
      })
      .first();
  }

  private async insertCompletedOperation(
    trx: any,
    request: DocumentExecuteRequest,
    actor: AuthenticatedUser,
    sessionId: string,
    inputRevision: number | null,
    outputRevision: number,
    response: { data: DocumentExecuteData },
  ): Promise<void> {
    await trx(
      'workflow_document_operation',
    ).insert({
      id_session: sessionId,
      execution_id: request.executionId,
      id_owner_profile: actor.profileId,
      idempotency_key: request.idempotencyKey,
      operation: request.operation,
      input_revision: inputRevision,
      output_revision: outputRevision,
      response: JSON.stringify(response),
      status: 'completed',
      date_completed: trx.fn.now(),
    });
  }

  private handleFromSession(
    session: any,
  ): DocumentHandle {
    return {
      sessionId: session.id_session,
      package: session.package,
      revision: Number(session.current_revision),
      mimeType: session.mime_type,
      fileName: session.file_name,
      expiresAt: new Date(
        session.expires_at,
      ).toISOString(),
    };
  }

  private responseData(
    handle: DocumentHandle,
    result?: Record<string, unknown>,
    file?: DocumentExecuteData['file'],
  ): DocumentExecuteData {
    return {
      document: handle,
      document_handle: handle,
      document_revision: handle.revision,
      ...(result ?? {}),
      ...(result ? { result } : {}),
      ...(file
        ? {
            file,
            id_file: file.id_file,
            version: file.version,
            file_name: file.file_name,
            mime_type: file.mime_type,
            size_bytes: file.size_bytes,
          }
        : {}),
    };
  }

  private async readTemporary(
    objectKey: string,
    revision: number,
  ): Promise<Buffer> {
    const object =
      await this.provider.getObjectStream(
        this.bucket,
        objectKey,
      );
    if (
      object.contentLength > this.maxDocumentBytes
    ) {
      throw new PayloadTooLargeException(
        'Documentul temporar depaseste limita permisa.',
      );
    }
    const chunks: Buffer[] = [];
    for await (const chunk of object.body) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk),
      );
    }
    const buffer = Buffer.concat(chunks);
    this.validateSize(buffer);
    if (
      !Number.isInteger(revision) ||
      revision < 0
    ) {
      throw new BadRequestException(
        'Revizia documentului este invalida.',
      );
    }
    return buffer;
  }

  private async putTemporary(
    objectKey: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<void> {
    await this.provider.putObjectStream({
      bucket: this.bucket,
      objectKey,
      body: Readable.from(buffer),
      contentLength: buffer.length,
      contentType: mimeType,
    });
  }

  private async deleteSessionObjects(
    session: any,
  ): Promise<void> {
    const prefix =
      session.current_object_key.replace(
        /\/r\d+\.[^/]+$/,
        '/',
      );
    let continuationToken: string | undefined;
    do {
      const page =
        await this.provider.listObjectsPage({
          bucket: this.bucket,
          prefix,
          continuationToken,
          maxKeys: 100,
        });
      await Promise.all(
        page.objects.map((object) =>
          this.provider.deleteObject(
            this.bucket,
            object.objectKey,
          ),
        ),
      );
      continuationToken =
        page.nextContinuationToken;
    } while (continuationToken);
  }

  private parseResponse(value: unknown): {
    data: DocumentExecuteData;
  } {
    if (typeof value === 'string')
      return JSON.parse(value);
    return value as { data: DocumentExecuteData };
  }

  private validateRequest(
    request: DocumentExecuteRequest,
  ): void {
    this.requiredString(
      request.executionId,
      'executionId',
    );
    this.requiredString(
      request.idempotencyKey,
      'idempotencyKey',
    );
    this.requiredString(
      request.operation,
      'operation',
    );
    if (
      !['word', 'pdf', 'excel', 'image'].includes(
        request.package,
      )
    ) {
      throw new BadRequestException(
        'Pachetul documentului este invalid.',
      );
    }
  }

  private validateSize(buffer: Buffer): void {
    if (
      !buffer.length ||
      buffer.length > this.maxDocumentBytes
    ) {
      throw new PayloadTooLargeException(
        `Documentul trebuie sa aiba intre 1 byte si ${this.maxDocumentBytes} bytes.`,
      );
    }
  }

  private requiredString(
    value: unknown,
    field: string,
  ): string {
    if (
      typeof value !== 'string' ||
      !value.trim()
    ) {
      throw new BadRequestException(
        `Argumentul "${field}" este obligatoriu.`,
      );
    }
    return value.trim();
  }

  private storageIdempotency(
    request: DocumentExecuteRequest,
    suffix: string,
  ): string {
    const digest = createHash('sha256')
      .update(
        `${request.executionId}:${request.idempotencyKey}:${suffix}`,
      )
      .digest('hex')
      .slice(0, 32);
    return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20)}`;
  }

  private objectKey(
    executionId: string,
    sessionId: string,
    revision: number,
    extension: string,
  ) {
    const safeExecution = executionId
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 180);
    return `_workflow/${this.tenantContext.slug}/${safeExecution}/${sessionId}/r${revision}.${extension}`;
  }

  private extensionFor(
    documentPackage: string,
  ): string {
    return (
      {
        word: 'docx',
        pdf: 'pdf',
        excel: 'xlsx',
        image: 'bin',
      }[documentPackage] ?? 'bin'
    );
  }

  private numberConfig(
    key: string,
    fallback: number,
  ): number {
    const value = Number(
      this.config.get<string>(
        key,
        String(fallback),
      ),
    );
    return Number.isFinite(value) && value > 0
      ? Math.floor(value)
      : fallback;
  }

  private get ttlSeconds(): number {
    return this.numberConfig(
      'WORKFLOW_DOCUMENT_TTL_SECONDS',
      DEFAULT_DOCUMENT_TTL_SECONDS,
    );
  }

  private get maxDocumentBytes(): number {
    return this.numberConfig(
      'WORKFLOW_DOCUMENT_MAX_BYTES',
      DEFAULT_MAX_DOCUMENT_BYTES,
    );
  }

  private get maxActiveSessions(): number {
    return this.numberConfig(
      'WORKFLOW_DOCUMENT_MAX_ACTIVE_SESSIONS',
      DEFAULT_MAX_ACTIVE_SESSIONS,
    );
  }

  private get bucket(): string {
    const bucket = this.config.get<string>(
      'STORAGE_S3_BUCKET',
      '',
    );
    if (!bucket)
      throw new ServiceUnavailableException(
        'Bucketul de storage nu este configurat.',
      );
    return bucket;
  }
}
