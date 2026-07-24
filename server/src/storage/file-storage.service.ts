import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { Readable } from 'stream';
import { AuthorizationService } from 'src/security/authorization.service';
import type { AuthenticatedUser } from 'src/security/security.types';
import { TenantContext } from 'src/tenant/tenant-context.service';
import { MetaDbService } from 'src/tenant/meta-db.service';
import {
  DEFAULT_ALLOWED_MIME_TYPES,
  DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  DEFAULT_UPLOAD_URL_TTL_SECONDS,
  MIME_EXTENSIONS,
  STORAGE_PROVIDER,
} from './storage.constants';
import { StorageQuotaService } from './storage-quota.service';
import type { StorageProvider } from './storage.types';
import type { CreateUploadSessionDto } from './dto/create-upload-session.dto';

export interface GeneratedFileResult {
  id_file: string;
  version: number;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}

@Injectable()
export class FileStorageService {
  constructor(
    private readonly tenantContext: TenantContext,
    private readonly metaDb: MetaDbService,
    private readonly authorization: AuthorizationService,
    private readonly config: ConfigService,
    private readonly quota: StorageQuotaService,
    @Inject(STORAGE_PROVIDER)
    private readonly provider: StorageProvider,
  ) {}

  private get knex() {
    return this.tenantContext.knex;
  }

  async createUploadSession(
    dto: CreateUploadSessionDto,
    actor: AuthenticatedUser,
  ) {
    this.ensureEnabled();
    const { field, entity } =
      await this.resolveFileField(dto.fieldId);
    await this.authorizeUploadTarget(
      entity,
      dto.recordId,
      actor,
    );
    const rules = this.parseRules(
      field.validation_rules,
    );
    this.validateFile(dto, rules);

    const idReservation = randomUUID();
    const fileId = randomUUID();
    const fileVersionId = fileId;
    const tenantId = await this.tenantId();
    const temporaryObjectKey = `_uploads/${tenantId}/${idReservation}`;
    const finalObjectKey = `tenants/${tenantId}/files/${fileId}`;
    const uploadTtl = this.numberConfig(
      'STORAGE_UPLOAD_URL_TTL_SECONDS',
      DEFAULT_UPLOAD_URL_TTL_SECONDS,
    );
    const expiresAt = new Date(
      Date.now() + uploadTtl * 1_000,
    );
    const result = await this.quota.reserve({
      idReservation,
      fileId,
      fileVersionId,
      ownerProfileId: actor.profileId,
      idempotencyKey: dto.idempotencyKey,
      temporaryObjectKey,
      finalObjectKey,
      expectedBytes: dto.sizeBytes,
      expiresAt,
    });
    const reservation = result.reservation;

    let storedFile = await this.knex(
      'stored_file',
    )
      .where({ id_file: reservation.file_id })
      .first();
    if (result.created) {
      try {
        storedFile = await this.knex.transaction(
          async (trx) => {
            const fileName =
              this.sanitizeFileName(dto.fileName);
            const [createdFile] = await trx(
              'stored_file',
            )
              .insert({
                id_file: reservation.file_id,
                reservation_id:
                  reservation.id_reservation,
                storage_provider: 's3',
                bucket: this.bucket,
                object_key:
                  reservation.final_object_key,
                original_name: fileName,
                mime_type:
                  dto.mimeType.toLowerCase(),
                size_bytes: dto.sizeBytes,
                status: 'pending',
                id_entity: entity.id_entity,
                id_field: field.id_field,
                record_id: null,
                id_owner_profile: actor.profileId,
                current_version_id:
                  reservation.file_version_id,
                current_version_number: 1,
              })
              .returning('*');
            await trx(
              'stored_file_version',
            ).insert({
              id_file_version:
                reservation.file_version_id,
              id_file: reservation.file_id,
              version_number: 1,
              reservation_id:
                reservation.id_reservation,
              storage_provider: 's3',
              bucket: this.bucket,
              object_key:
                reservation.final_object_key,
              file_name: fileName,
              mime_type:
                dto.mimeType.toLowerCase(),
              size_bytes: dto.sizeBytes,
              status: 'pending',
              id_creator_profile: actor.profileId,
            });
            return createdFile;
          },
        );
      } catch (error) {
        await this.quota.fail(
          reservation.file_id,
          'failed',
          'TENANT_METADATA_INSERT_FAILED',
        );
        throw error;
      }
    }

    if (!storedFile) {
      await this.quota.fail(
        reservation.file_id,
        'failed',
        'TENANT_METADATA_MISSING',
      );
      throw new ServiceUnavailableException(
        'Metadatele uploadului nu au putut fi create.',
      );
    }

    if (
      reservation.status === 'completed' ||
      storedFile.status === 'active'
    ) {
      return {
        file: this.toPublicFile(storedFile),
        uploadUrl: null,
        uploadHeaders: {},
        expiresAt: null,
      };
    }
    if (reservation.status !== 'pending') {
      return {
        file: this.toPublicFile(storedFile),
        uploadUrl: null,
        uploadHeaders: {},
        expiresAt: reservation.expires_at,
      };
    }

    try {
      const uploadUrl =
        await this.provider.createUploadUrl({
          bucket: this.bucket,
          objectKey:
            reservation.temporary_object_key,
          contentType: storedFile.mime_type,
          fileId: storedFile.id_file,
          expectedBytes: Number(
            reservation.expected_bytes,
          ),
          expiresInSeconds: Math.max(
            1,
            Math.floor(
              (new Date(
                reservation.expires_at,
              ).getTime() -
                Date.now()) /
                1_000,
            ),
          ),
        });
      return {
        file: this.toPublicFile(storedFile),
        uploadUrl,
        uploadHeaders: {
          'Content-Type': storedFile.mime_type,
          'x-amz-meta-file-id':
            storedFile.id_file,
          'x-amz-meta-expected-bytes': String(
            reservation.expected_bytes,
          ),
        },
        expiresAt: reservation.expires_at,
      };
    } catch (error) {
      await this.knex('stored_file')
        .where({ id_file: storedFile.id_file })
        .update({
          status: 'failed',
          date_updated: this.knex.fn.now(),
        });
      await this.quota.fail(
        storedFile.id_file,
        'failed',
        'PRESIGN_FAILED',
      );
      throw error;
    }
  }

  async completeUpload(
    fileId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureEnabled();
    const file = await this.requireOwnedFile(
      fileId,
      actor,
    );
    const reservation =
      await this.quota.getReservation(fileId);
    if (
      file.status === 'active' &&
      reservation.status === 'completed'
    )
      return this.toPublicFile(file);
    if (
      !['pending', 'scanning'].includes(
        file.status,
      )
    ) {
      throw new ConflictException(
        'Fisierul nu mai poate fi confirmat.',
      );
    }

    const temporary =
      await this.provider.headObject(
        this.bucket,
        reservation.temporary_object_key,
      );
    if (!temporary)
      throw new BadRequestException(
        'Fisierul nu a fost incarcat inca.',
      );

    const expectedBytes = Number(
      reservation.expected_bytes,
    );
    const expectedMime = String(
      file.mime_type,
    ).toLowerCase();
    const actualMime = String(
      temporary.contentType ?? '',
    )
      .split(';')[0]
      .trim()
      .toLowerCase();
    const metadataMatches =
      temporary.metadata['file-id'] === fileId &&
      Number(
        temporary.metadata['expected-bytes'],
      ) === expectedBytes;

    if (
      temporary.contentLength !== expectedBytes ||
      actualMime !== expectedMime ||
      !metadataMatches
    ) {
      await this.rejectUpload(
        file,
        reservation,
        'UPLOAD_METADATA_MISMATCH',
      );
      throw new BadRequestException(
        'Dimensiunea sau tipul fisierului incarcat nu corespunde sesiunii aprobate.',
      );
    }

    await this.quota.markFinalizing(fileId);
    await this.knex('stored_file')
      .where({ id_file: fileId })
      .update({
        status: 'scanning',
        date_updated: this.knex.fn.now(),
      });

    try {
      await this.copyToFinalKey(
        reservation,
        file,
      );
      const finalHead =
        await this.provider.headObject(
          this.bucket,
          reservation.final_object_key,
        );
      if (
        !finalHead ||
        finalHead.contentLength !== expectedBytes
      ) {
        throw new ServiceUnavailableException(
          'Obiectul final nu a putut fi verificat.',
        );
      }

      await this.quota.complete(fileId);
      const active = await this.knex.transaction(
        async (trx) => {
          await trx('stored_file_version')
            .where({
              id_file_version:
                reservation.file_version_id,
            })
            .update({
              status: 'active',
              etag: finalHead.etag,
            });
          const [updated] = await trx(
            'stored_file',
          )
            .where({ id_file: fileId })
            .update({
              status: 'active',
              etag: finalHead.etag,
              date_updated: trx.fn.now(),
            })
            .returning('*');
          return updated;
        },
      );

      await this.provider
        .deleteObject(
          this.bucket,
          reservation.temporary_object_key,
        )
        .catch(() => undefined);
      return this.toPublicFile(active);
    } catch (error) {
      const freshReservation =
        await this.quota.getReservation(fileId);
      if (
        freshReservation.status !== 'completed'
      ) {
        await this.knex('stored_file')
          .where({ id_file: fileId })
          .update({
            status: 'pending',
            date_updated: this.knex.fn.now(),
          });
        await this.knex('stored_file_version')
          .where({
            id_file_version:
              reservation.file_version_id,
          })
          .update({ status: 'pending' });
      }
      throw error;
    }
  }

  async metadata(
    fileId: string,
    actor: AuthenticatedUser,
  ) {
    const file = await this.requireFile(fileId);
    await this.authorizeFileAccess(
      file,
      actor,
      'read',
    );
    return this.toPublicFile(file);
  }

  async downloadUrl(
    fileId: string,
    actor: AuthenticatedUser,
  ) {
    this.ensureEnabled();
    const file = await this.requireFile(fileId);
    if (file.status !== 'active')
      throw new ConflictException(
        'Fisierul nu este disponibil pentru descarcare.',
      );
    await this.authorizeFileAccess(
      file,
      actor,
      'read',
    );
    const expiresInSeconds = this.numberConfig(
      'STORAGE_DOWNLOAD_URL_TTL_SECONDS',
      DEFAULT_DOWNLOAD_URL_TTL_SECONDS,
    );
    const url =
      await this.provider.createDownloadUrl({
        bucket: file.bucket,
        objectKey: file.object_key,
        downloadName: file.original_name,
        expiresInSeconds,
      });
    return {
      url,
      expiresAt: new Date(
        Date.now() + expiresInSeconds * 1_000,
      ),
    };
  }

  async getFileBufferForWorkflow(
    fileId: string,
    actor: AuthenticatedUser,
    versionNumber?: number,
  ): Promise<{
    buffer: Buffer;
    file: any;
    version: any;
  }> {
    this.ensureEnabled();
    const file = await this.requireFile(fileId);
    if (file.status !== 'active') {
      throw new ConflictException(
        'Fisierul nu este disponibil.',
      );
    }
    await this.authorizeFileAccess(
      file,
      actor,
      'read',
    );

    const versionQuery = this.knex(
      'stored_file_version',
    ).where({
      id_file: fileId,
      status: 'active',
    });
    if (versionNumber != null) {
      versionQuery.where({
        version_number: versionNumber,
      });
    } else {
      versionQuery.where({
        id_file_version: file.current_version_id,
      });
    }
    const version = await versionQuery.first();
    if (!version) {
      throw new NotFoundException(
        'Versiunea fisierului nu exista.',
      );
    }

    const object =
      await this.provider.getObjectStream(
        version.bucket,
        version.object_key,
      );
    return {
      buffer: await this.streamToBuffer(
        object.body,
      ),
      file,
      version,
    };
  }

  async createGeneratedFile(
    input: {
      buffer: Buffer;
      fileName: string;
      mimeType: string;
      idempotencyKey: string;
    },
    actor: AuthenticatedUser,
  ): Promise<GeneratedFileResult> {
    this.ensureEnabled();
    this.validateGeneratedFile(input);

    const tenantId = await this.tenantId();
    const fileId = randomUUID();
    const fileVersionId = fileId;
    const reservationId = randomUUID();
    const fileName = this.sanitizeFileName(
      input.fileName,
    );
    const finalObjectKey = `tenants/${tenantId}/files/${fileId}/versions/${fileVersionId}`;
    const reservationResult =
      await this.quota.reserve({
        idReservation: reservationId,
        fileId,
        fileVersionId,
        ownerProfileId: actor.profileId,
        idempotencyKey: input.idempotencyKey,
        temporaryObjectKey: `_generated/${tenantId}/${reservationId}`,
        finalObjectKey,
        expectedBytes: input.buffer.length,
        expiresAt: new Date(
          Date.now() +
            DEFAULT_UPLOAD_URL_TTL_SECONDS *
              1_000,
        ),
      });
    const reservation =
      reservationResult.reservation;

    const existing = await this.knex(
      'stored_file',
    )
      .where({ id_file: reservation.file_id })
      .first();
    if (
      existing?.status === 'active' &&
      reservation.status === 'completed'
    ) {
      return this.toGeneratedFile(existing);
    }

    try {
      if (!existing) {
        await this.insertGeneratedVersionMetadata(
          {
            fileId: reservation.file_id,
            fileVersionId:
              reservation.file_version_id,
            reservationId:
              reservation.id_reservation,
            objectKey:
              reservation.final_object_key,
            fileName,
            mimeType:
              input.mimeType.toLowerCase(),
            sizeBytes: input.buffer.length,
            versionNumber: 1,
            actor,
            createLogicalFile: true,
          },
        );
      }

      await this.provider.putObjectStream({
        bucket: this.bucket,
        objectKey: reservation.final_object_key,
        body: Readable.from(input.buffer),
        contentLength: input.buffer.length,
        contentType: input.mimeType.toLowerCase(),
        metadata: {
          'file-id': reservation.file_id,
          'file-version-id':
            reservation.file_version_id,
        },
      });
      const head = await this.provider.headObject(
        this.bucket,
        reservation.final_object_key,
      );
      if (
        !head ||
        head.contentLength !== input.buffer.length
      ) {
        throw new ServiceUnavailableException(
          'Fisierul generat nu a putut fi verificat.',
        );
      }
      await this.quota.markFinalizing(
        reservation.file_id,
        this.tenantContext.slug,
        reservation.file_version_id,
      );
      await this.quota.complete(
        reservation.file_id,
        this.tenantContext.slug,
        reservation.file_version_id,
      );
      const active =
        await this.activateGeneratedVersion(
          reservation.file_id,
          reservation.file_version_id,
          head.etag,
        );
      return this.toGeneratedFile(active);
    } catch (error) {
      await this.failGeneratedVersion(
        reservation,
        'GENERATED_FILE_SAVE_FAILED',
      );
      throw error;
    }
  }

  async updateGeneratedFile(
    fileId: string,
    input: {
      buffer: Buffer;
      fileName?: string;
      mimeType: string;
      idempotencyKey: string;
    },
    actor: AuthenticatedUser,
  ): Promise<GeneratedFileResult> {
    this.ensureEnabled();
    const current =
      await this.requireFile(fileId);
    await this.authorizeFileAccess(
      current,
      actor,
      'update',
    );
    if (
      String(current.mime_type).toLowerCase() !==
      input.mimeType.toLowerCase()
    ) {
      throw new BadRequestException(
        'Noua versiune trebuie sa pastreze tipul MIME al fisierului.',
      );
    }
    const fileName = this.sanitizeFileName(
      input.fileName || current.original_name,
    );
    this.validateGeneratedFile({
      ...input,
      fileName,
    });

    const tenantId = await this.tenantId();
    const candidateVersionId = randomUUID();
    const reservationId = randomUUID();
    const reservationResult =
      await this.quota.reserve({
        idReservation: reservationId,
        fileId,
        fileVersionId: candidateVersionId,
        ownerProfileId: actor.profileId,
        idempotencyKey: input.idempotencyKey,
        temporaryObjectKey: `_generated/${tenantId}/${reservationId}`,
        finalObjectKey: `tenants/${tenantId}/files/${fileId}/versions/${candidateVersionId}`,
        expectedBytes: input.buffer.length,
        expiresAt: new Date(
          Date.now() +
            DEFAULT_UPLOAD_URL_TTL_SECONDS *
              1_000,
        ),
      });
    const reservation =
      reservationResult.reservation;
    const existingVersion = await this.knex(
      'stored_file_version',
    )
      .where({
        id_file_version:
          reservation.file_version_id,
      })
      .first();
    if (
      existingVersion?.status === 'active' &&
      reservation.status === 'completed'
    ) {
      const latest =
        await this.requireFile(fileId);
      return this.toGeneratedFile(latest);
    }

    try {
      if (!existingVersion) {
        await this.insertGeneratedVersionMetadata(
          {
            fileId,
            fileVersionId:
              reservation.file_version_id,
            reservationId:
              reservation.id_reservation,
            objectKey:
              reservation.final_object_key,
            fileName,
            mimeType:
              input.mimeType.toLowerCase(),
            sizeBytes: input.buffer.length,
            versionNumber: undefined,
            actor,
            createLogicalFile: false,
          },
        );
      }

      await this.provider.putObjectStream({
        bucket: this.bucket,
        objectKey: reservation.final_object_key,
        body: Readable.from(input.buffer),
        contentLength: input.buffer.length,
        contentType: input.mimeType.toLowerCase(),
        metadata: {
          'file-id': fileId,
          'file-version-id':
            reservation.file_version_id,
        },
      });
      const head = await this.provider.headObject(
        this.bucket,
        reservation.final_object_key,
      );
      if (
        !head ||
        head.contentLength !== input.buffer.length
      ) {
        throw new ServiceUnavailableException(
          'Noua versiune nu a putut fi verificata.',
        );
      }
      await this.quota.markFinalizing(
        fileId,
        this.tenantContext.slug,
        reservation.file_version_id,
      );
      await this.quota.complete(
        fileId,
        this.tenantContext.slug,
        reservation.file_version_id,
      );
      const active =
        await this.activateGeneratedVersion(
          fileId,
          reservation.file_version_id,
          head.etag,
        );
      return this.toGeneratedFile(active);
    } catch (error) {
      await this.failGeneratedVersion(
        reservation,
        'GENERATED_FILE_UPDATE_FAILED',
      );
      throw error;
    }
  }

  async remove(
    fileId: string,
    actor: AuthenticatedUser,
  ) {
    const file = await this.requireFile(fileId);
    if (file.record_id) {
      throw new ConflictException(
        'Elimina fisierul din formularul inregistrarii si salveaza modificarile.',
      );
    }
    if (
      file.id_owner_profile !== actor.profileId &&
      !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException(
        'Nu poti sterge acest fisier.',
      );
    }

    if (
      ['pending', 'scanning', 'failed'].includes(
        file.status,
      )
    ) {
      const reservation =
        await this.quota.getReservation(fileId);
      if (reservation.status === 'completed') {
        await this.knex('stored_file')
          .where({ id_file: fileId })
          .update({
            status: 'deleting',
            date_updated: this.knex.fn.now(),
          });
        await this.finalizeDeletion(fileId);
        await this.provider
          .deleteObject(
            file.bucket,
            reservation.temporary_object_key,
          )
          .catch(() => undefined);
        return;
      }
      await Promise.allSettled([
        this.provider.deleteObject(
          file.bucket,
          reservation.temporary_object_key,
        ),
        this.provider.deleteObject(
          file.bucket,
          reservation.final_object_key,
        ),
      ]);
      await this.quota.fail(
        fileId,
        'failed',
        'CANCELLED_BY_USER',
      );
      await this.knex('stored_file')
        .where({ id_file: fileId })
        .update({
          status: 'deleted',
          date_deleted: this.knex.fn.now(),
          date_updated: this.knex.fn.now(),
        });
      await this.knex('stored_file_version')
        .where({ id_file: fileId })
        .whereNot({ status: 'deleted' })
        .update({
          status: 'deleted',
          date_deleted: this.knex.fn.now(),
        });
      return;
    }

    if (file.status === 'active') {
      await this.knex('stored_file')
        .where({ id_file: fileId })
        .update({
          status: 'deleting',
          date_updated: this.knex.fn.now(),
        });
      await this.finalizeDeletion(fileId);
    }
  }

  async validateFileForBinding(
    field: any,
    fileId: string | null,
    actor: AuthenticatedUser,
    recordId?: string,
  ) {
    if (!fileId) return null;
    const file = await this.knex('stored_file')
      .where({ id_file: fileId })
      .first();
    if (!file || file.status !== 'active')
      throw new BadRequestException(
        `Fisierul selectat pentru "${field.name}" nu este activ.`,
      );
    const isUnbound =
      !file.id_entity && !file.id_field;
    if (
      !isUnbound &&
      (file.id_entity !== field.id_entity ||
        file.id_field !== field.id_field)
    ) {
      throw new BadRequestException(
        `Fisierul selectat nu apartine campului "${field.name}".`,
      );
    }
    if (
      file.record_id &&
      file.record_id !== recordId
    ) {
      throw new BadRequestException(
        'Fisierul este deja legat de alta inregistrare.',
      );
    }
    if (isUnbound) {
      this.validateGeneratedFile(
        {
          fileName: file.original_name,
          mimeType: file.mime_type,
          sizeBytes: Number(file.size_bytes),
        },
        this.parseRules(field.validation_rules),
      );
    }
    if (
      !file.record_id &&
      file.id_owner_profile !== actor.profileId &&
      !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException(
        'Nu poti folosi fisierul incarcat de alt profil.',
      );
    }
    return file;
  }

  async bindInTransaction(
    trx: Knex.Transaction,
    fileId: string,
    entityId: string,
    fieldId: string,
    recordId: string,
    actor: AuthenticatedUser,
  ): Promise<void> {
    const file = await trx('stored_file')
      .where({ id_file: fileId })
      .forUpdate()
      .first();
    if (
      !file ||
      file.status !== 'active' ||
      ((file.id_entity || file.id_field) &&
        (file.id_entity !== entityId ||
          file.id_field !== fieldId))
    ) {
      throw new BadRequestException(
        'Fisierul nu poate fi legat de aceasta inregistrare.',
      );
    }
    if (
      file.record_id &&
      file.record_id !== recordId
    )
      throw new ConflictException(
        'Fisierul este deja folosit.',
      );
    if (
      !file.record_id &&
      file.id_owner_profile !== actor.profileId &&
      !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException(
        'Nu poti folosi fisierul incarcat de alt profil.',
      );
    }
    await trx('stored_file')
      .where({ id_file: fileId })
      .update({
        id_entity: file.id_entity ?? entityId,
        id_field: file.id_field ?? fieldId,
        record_id: recordId,
        date_updated: trx.fn.now(),
      });
  }

  async markForDeletionInTransaction(
    trx: Knex.Transaction,
    fileId: string,
    recordId: string,
  ): Promise<void> {
    await trx('stored_file')
      .where({
        id_file: fileId,
        record_id: recordId,
        status: 'active',
      })
      .update({
        status: 'deleting',
        record_id: null,
        date_updated: trx.fn.now(),
      });
  }

  async finalizeDeletion(
    fileId: string,
  ): Promise<void> {
    const file = await this.requireFile(fileId);
    if (file.status === 'deleted') return;
    if (file.status !== 'deleting')
      throw new ConflictException(
        'Fisierul nu este pregatit pentru stergere.',
      );
    const versions = await this.knex(
      'stored_file_version',
    )
      .where({ id_file: fileId })
      .whereNot({ status: 'deleted' })
      .orderBy('version_number', 'asc');

    for (const version of versions) {
      await this.provider.deleteObject(
        version.bucket,
        version.object_key,
      );
      const remaining =
        await this.provider.headObject(
          version.bucket,
          version.object_key,
        );
      if (remaining) {
        throw new ServiceUnavailableException(
          'Stergerea unei versiuni nu a fost confirmata.',
        );
      }
      const reservation =
        await this.quota.getReservation(
          fileId,
          this.tenantContext.slug,
          version.id_file_version,
        );
      if (reservation.status === 'completed') {
        await this.quota.deleteCompleted(
          fileId,
          this.tenantContext.slug,
          version.id_file_version,
        );
      } else if (
        ['pending', 'finalizing'].includes(
          reservation.status,
        )
      ) {
        await this.quota.fail(
          fileId,
          'failed',
          'FILE_DELETED',
          this.tenantContext.slug,
          version.id_file_version,
        );
      }
      await this.knex('stored_file_version')
        .where({
          id_file_version:
            version.id_file_version,
        })
        .update({
          status: 'deleted',
          date_deleted: this.knex.fn.now(),
        });
    }

    await this.knex('stored_file')
      .where({ id_file: fileId })
      .update({
        status: 'deleted',
        date_deleted: this.knex.fn.now(),
        date_updated: this.knex.fn.now(),
      });
  }

  private async insertGeneratedVersionMetadata(input: {
    fileId: string;
    fileVersionId: string;
    reservationId: string;
    objectKey: string;
    fileName: string;
    mimeType: string;
    sizeBytes: number;
    versionNumber?: number;
    actor: AuthenticatedUser;
    createLogicalFile: boolean;
  }): Promise<void> {
    await this.knex.transaction(async (trx) => {
      let versionNumber = input.versionNumber;
      if (input.createLogicalFile) {
        await trx('stored_file').insert({
          id_file: input.fileId,
          reservation_id: input.reservationId,
          storage_provider: 's3',
          bucket: this.bucket,
          object_key: input.objectKey,
          original_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
          status: 'pending',
          id_entity: null,
          id_field: null,
          record_id: null,
          id_owner_profile: input.actor.profileId,
          current_version_id: input.fileVersionId,
          current_version_number: 1,
        });
        versionNumber = 1;
      } else {
        const logicalFile = await trx(
          'stored_file',
        )
          .where({ id_file: input.fileId })
          .forUpdate()
          .first();
        if (
          !logicalFile ||
          logicalFile.status !== 'active'
        ) {
          throw new ConflictException(
            'Fisierul nu mai poate fi versionat.',
          );
        }
        const maximum = await trx(
          'stored_file_version',
        )
          .where({ id_file: input.fileId })
          .max('version_number as value')
          .first();
        versionNumber =
          Number(maximum?.value ?? 0) + 1;
      }

      await trx('stored_file_version').insert({
        id_file_version: input.fileVersionId,
        id_file: input.fileId,
        version_number: versionNumber,
        reservation_id: input.reservationId,
        storage_provider: 's3',
        bucket: this.bucket,
        object_key: input.objectKey,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
        status: 'pending',
        id_creator_profile: input.actor.profileId,
      });
    });
  }

  private async activateGeneratedVersion(
    fileId: string,
    fileVersionId: string,
    etag: string | null,
  ): Promise<any> {
    return this.knex.transaction(async (trx) => {
      const logicalFile = await trx('stored_file')
        .where({ id_file: fileId })
        .forUpdate()
        .first();
      if (!logicalFile) {
        throw new NotFoundException(
          'Metadatele fisierului nu exista.',
        );
      }
      const version = await trx(
        'stored_file_version',
      )
        .where({
          id_file_version: fileVersionId,
          id_file: fileId,
        })
        .forUpdate()
        .first();
      if (!version) {
        throw new NotFoundException(
          'Metadatele versiunii nu exista.',
        );
      }
      await trx('stored_file_version')
        .where({ id_file_version: fileVersionId })
        .update({ status: 'active', etag });

      let active = logicalFile;
      if (
        Number(version.version_number) >=
        Number(
          logicalFile.current_version_number ?? 0,
        )
      ) {
        [active] = await trx('stored_file')
          .where({ id_file: fileId })
          .update({
            reservation_id:
              version.reservation_id,
            storage_provider:
              version.storage_provider,
            bucket: version.bucket,
            object_key: version.object_key,
            original_name: version.file_name,
            mime_type: version.mime_type,
            size_bytes: version.size_bytes,
            checksum: version.checksum,
            etag,
            status: 'active',
            current_version_id:
              version.id_file_version,
            current_version_number:
              version.version_number,
            date_updated: trx.fn.now(),
          })
          .returning('*');
      }
      return {
        ...active,
        original_name: version.file_name,
        mime_type: version.mime_type,
        size_bytes: version.size_bytes,
        current_version_number:
          version.version_number,
      };
    });
  }

  private async failGeneratedVersion(
    reservation: any,
    errorCode: string,
  ): Promise<void> {
    const fresh = await this.quota
      .getReservation(
        reservation.file_id,
        this.tenantContext.slug,
        reservation.file_version_id,
      )
      .catch(() => null);
    if (fresh?.status === 'completed') return;

    await this.provider
      .deleteObject(
        this.bucket,
        reservation.final_object_key,
      )
      .catch(() => undefined);
    await this.quota
      .fail(
        reservation.file_id,
        'failed',
        errorCode,
        this.tenantContext.slug,
        reservation.file_version_id,
      )
      .catch(() => undefined);
    await this.knex('stored_file_version')
      .where({
        id_file_version:
          reservation.file_version_id,
      })
      .update({ status: 'failed' });
    await this.knex('stored_file')
      .where({
        id_file: reservation.file_id,
        current_version_id:
          reservation.file_version_id,
        status: 'pending',
      })
      .update({
        status: 'failed',
        date_updated: this.knex.fn.now(),
      });
  }

  private validateGeneratedFile(
    input: {
      buffer?: Buffer;
      sizeBytes?: number;
      fileName: string;
      mimeType: string;
    },
    rules: Record<string, any> = {},
  ): void {
    const sizeBytes =
      input.sizeBytes ??
      input.buffer?.length ??
      0;
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0
    ) {
      throw new BadRequestException(
        'Fisierul generat este gol sau invalid.',
      );
    }
    this.validateFile(
      {
        fieldId: '',
        fileName: input.fileName,
        mimeType: input.mimeType,
        sizeBytes,
        idempotencyKey: randomUUID(),
      },
      rules,
    );
  }

  private toGeneratedFile(
    file: any,
  ): GeneratedFileResult {
    return {
      id_file: file.id_file,
      version: Number(
        file.current_version_number ?? 1,
      ),
      file_name: file.original_name,
      mime_type: file.mime_type,
      size_bytes: Number(file.size_bytes),
    };
  }

  private async streamToBuffer(
    stream: Readable,
  ): Promise<Buffer> {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(
        Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk),
      );
    }
    return Buffer.concat(chunks);
  }

  private async copyToFinalKey(
    reservation: any,
    file: any,
  ): Promise<void> {
    try {
      await this.provider.copyObject(
        this.bucket,
        reservation.temporary_object_key,
        reservation.final_object_key,
      );
    } catch {
      const source =
        await this.provider.getObjectStream(
          this.bucket,
          reservation.temporary_object_key,
        );
      await this.provider.putObjectStream({
        bucket: this.bucket,
        objectKey: reservation.final_object_key,
        body: source.body,
        contentLength: source.contentLength,
        contentType: file.mime_type,
        metadata: source.metadata,
      });
    }
  }

  private async rejectUpload(
    file: any,
    reservation: any,
    errorCode: string,
  ): Promise<void> {
    await Promise.allSettled([
      this.provider.deleteObject(
        file.bucket,
        reservation.temporary_object_key,
      ),
      this.provider.deleteObject(
        file.bucket,
        reservation.final_object_key,
      ),
    ]);
    await this.quota.fail(
      file.id_file,
      'failed',
      errorCode,
    );
    await this.knex('stored_file')
      .where({ id_file: file.id_file })
      .update({
        status: 'rejected',
        date_updated: this.knex.fn.now(),
      });
    await this.knex('stored_file_version')
      .where({
        id_file_version:
          reservation.file_version_id,
      })
      .update({ status: 'rejected' });
  }

  private async resolveFileField(
    fieldId: string,
  ) {
    const field = await this.knex('field')
      .where({ id_field: fieldId })
      .first();
    if (!field)
      throw new NotFoundException(
        'Campul de fisier nu exista.',
      );
    if (
      field.ui_type !== 'file' ||
      field.data_type !== 'uuid'
    ) {
      throw new BadRequestException(
        'Campul selectat nu este configurat pentru fisiere.',
      );
    }
    if (
      !field.visible_in_form ||
      field.is_readonly
    ) {
      throw new ForbiddenException(
        'Campul nu permite incarcarea fisierelor.',
      );
    }
    const entity = await this.knex('entity')
      .where({ id_entity: field.id_entity })
      .first();
    if (!entity)
      throw new NotFoundException(
        'Entitatea campului nu exista.',
      );
    return { field, entity };
  }

  private async authorizeUploadTarget(
    entity: any,
    recordId: string | undefined,
    actor: AuthenticatedUser,
  ): Promise<void> {
    if (!recordId) {
      await this.authorization.require(
        actor,
        entity.id_entity,
        'create',
      );
      return;
    }
    const scope =
      await this.authorization.require(
        actor,
        entity.id_entity,
        'update',
      );
    const query = this.knex(
      entity.table_name,
    ).where('id', recordId);
    this.authorization.applyScope(
      query,
      entity.table_name,
      scope,
      actor.profileId,
    );
    if (!(await query.first()))
      throw new NotFoundException(
        'Inregistrarea nu exista sau nu poate fi modificata.',
      );
  }

  private async authorizeFileAccess(
    file: any,
    actor: AuthenticatedUser,
    action: 'read' | 'update',
  ): Promise<void> {
    if (!file.record_id) {
      if (
        file.id_owner_profile !==
          actor.profileId &&
        !actor.roles.includes('admin')
      ) {
        throw new ForbiddenException(
          'Nu ai acces la acest fisier.',
        );
      }
      return;
    }
    const entity = await this.knex('entity')
      .where({ id_entity: file.id_entity })
      .first();
    const field = await this.knex('field')
      .where({
        id_field: file.id_field,
        id_entity: file.id_entity,
      })
      .first();
    if (!entity || !field)
      throw new NotFoundException(
        'Legatura fisierului nu mai exista.',
      );
    const scope =
      await this.authorization.require(
        actor,
        entity.id_entity,
        action,
      );
    const query = this.knex(entity.table_name)
      .where(
        `${entity.table_name}.id`,
        file.record_id,
      )
      .where(
        `${entity.table_name}.${field.column_name}`,
        file.id_file,
      );
    this.authorization.applyScope(
      query,
      entity.table_name,
      scope,
      actor.profileId,
    );
    if (!(await query.first()))
      throw new ForbiddenException(
        'Nu ai acces la acest fisier.',
      );
  }

  private validateFile(
    dto: CreateUploadSessionDto,
    rules: Record<string, any>,
  ): void {
    const allowed = this.allowedMimeTypes();
    const fieldAllowed = Array.isArray(
      rules.allowed_mime_types,
    )
      ? rules.allowed_mime_types.map(
          (value: unknown) =>
            String(value).toLowerCase(),
        )
      : allowed;
    const effectiveAllowed = fieldAllowed.filter(
      (mime: string) => allowed.includes(mime),
    );
    const mime = dto.mimeType.toLowerCase();
    if (!effectiveAllowed.includes(mime))
      throw new BadRequestException(
        'Tipul acestui fisier nu este permis.',
      );

    const globalMax = this.numberConfig(
      'STORAGE_MAX_FILE_SIZE_BYTES',
      DEFAULT_MAX_FILE_SIZE_BYTES,
    );
    const fieldMax = Number(
      rules.max_file_size_bytes || globalMax,
    );
    if (
      dto.sizeBytes >
      Math.min(globalMax, fieldMax)
    ) {
      throw new BadRequestException(
        `Fisierul poate avea maximum ${Math.min(globalMax, fieldMax) / 1_000_000} MB.`,
      );
    }

    const extension =
      dto.fileName
        .split('.')
        .pop()
        ?.toLowerCase() ?? '';
    const expectedExtensions =
      MIME_EXTENSIONS[mime];
    if (
      expectedExtensions &&
      !expectedExtensions.includes(extension)
    ) {
      throw new BadRequestException(
        'Extensia fisierului nu corespunde tipului declarat.',
      );
    }
  }

  private parseRules(
    value: unknown,
  ): Record<string, any> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value as Record<string, any>;
  }

  private allowedMimeTypes(): string[] {
    const configured = this.config.get<string>(
      'STORAGE_ALLOWED_MIME_TYPES',
      '',
    );
    return configured
      ? configured
          .split(',')
          .map((value) =>
            value.trim().toLowerCase(),
          )
          .filter(Boolean)
      : [...DEFAULT_ALLOWED_MIME_TYPES];
  }

  private sanitizeFileName(
    value: string,
  ): string {
    const base =
      value.split(/[\\/]/).pop() || 'fisier';
    return base
      .replace(/[\u0000-\u001f\u007f]/g, '_')
      .slice(0, 255);
  }

  private async requireOwnedFile(
    fileId: string,
    actor: AuthenticatedUser,
  ) {
    const file = await this.requireFile(fileId);
    if (
      file.id_owner_profile !== actor.profileId &&
      !actor.roles.includes('admin')
    ) {
      throw new ForbiddenException(
        'Nu poti confirma acest fisier.',
      );
    }
    return file;
  }

  private async requireFile(fileId: string) {
    const file = await this.knex('stored_file')
      .where({ id_file: fileId })
      .first();
    if (!file)
      throw new NotFoundException(
        'Fisierul nu exista.',
      );
    return file;
  }

  private toPublicFile(file: any) {
    return {
      idFile: file.id_file,
      originalName: file.original_name,
      mimeType: file.mime_type,
      sizeBytes: Number(file.size_bytes),
      status: file.status,
      recordId: file.record_id,
      createdAt: file.date_created,
      updatedAt: file.date_updated,
    };
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

  private ensureEnabled(): void {
    if (
      this.config.get<string>(
        'STORAGE_ENABLED',
        'false',
      ) !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'Storage-ul de fisiere nu este activat.',
      );
    }
  }

  private get bucket(): string {
    const value = this.config.get<string>(
      'STORAGE_S3_BUCKET',
      '',
    );
    if (!value)
      throw new ServiceUnavailableException(
        'Bucketul de storage nu este configurat.',
      );
    return value;
  }

  private async tenantId(): Promise<string> {
    const tenant = await this.configuredTenant();
    return tenant.id;
  }

  private async configuredTenant() {
    const tenant = await this.metaDb
      .knex('tenants')
      .where({ slug: this.tenantContext.slug })
      .first();
    if (!tenant)
      throw new ServiceUnavailableException(
        'Tenantul nu exista in meta DB.',
      );
    return tenant;
  }
}
