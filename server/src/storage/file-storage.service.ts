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
        [storedFile] = await this.knex(
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
            original_name: this.sanitizeFileName(
              dto.fileName,
            ),
            mime_type: dto.mimeType.toLowerCase(),
            size_bytes: dto.sizeBytes,
            status: 'pending',
            id_entity: entity.id_entity,
            id_field: field.id_field,
            record_id: null,
            id_owner_profile: actor.profileId,
          })
          .returning('*');
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
      const [active] = await this.knex(
        'stored_file',
      )
        .where({ id_file: fileId })
        .update({
          status: 'active',
          etag: finalHead.etag,
          date_updated: this.knex.fn.now(),
        })
        .returning('*');

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
    if (
      file.id_entity !== field.id_entity ||
      file.id_field !== field.id_field
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
      file.id_entity !== entityId ||
      file.id_field !== fieldId
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
    await this.provider.deleteObject(
      file.bucket,
      file.object_key,
    );
    const remaining =
      await this.provider.headObject(
        file.bucket,
        file.object_key,
      );
    if (remaining)
      throw new ServiceUnavailableException(
        'Stergerea obiectului nu a fost confirmata.',
      );
    await this.quota.deleteCompleted(fileId);
    await this.knex('stored_file')
      .where({ id_file: fileId })
      .update({
        status: 'deleted',
        date_deleted: this.knex.fn.now(),
        date_updated: this.knex.fn.now(),
      });
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
