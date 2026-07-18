import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'stream';
import type {
  StorageObjectHead,
  StorageObjectStream,
  StorageProvider,
} from './storage.types';

@Injectable()
export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(
    private readonly config: ConfigService,
  ) {
    this.client = new S3Client({
      endpoint:
        config.get<string>(
          'STORAGE_S3_ENDPOINT',
        ) || undefined,
      region: config.get<string>(
        'STORAGE_S3_REGION',
        'nbg1',
      ),
      forcePathStyle:
        config.get<string>(
          'STORAGE_S3_FORCE_PATH_STYLE',
          'false',
        ) === 'true',
      credentials: {
        accessKeyId: config.get<string>(
          'STORAGE_S3_ACCESS_KEY',
          '',
        ),
        secretAccessKey: config.get<string>(
          'STORAGE_S3_SECRET_KEY',
          '',
        ),
      },
    });
  }

  async createUploadUrl(input: {
    bucket: string;
    objectKey: string;
    contentType: string;
    fileId: string;
    expectedBytes: number;
    expiresInSeconds: number;
  }): Promise<string> {
    this.ensureConfigured();
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ContentType: input.contentType,
        Metadata: {
          'file-id': input.fileId,
          'expected-bytes': String(
            input.expectedBytes,
          ),
        },
      }),
      {
        expiresIn: input.expiresInSeconds,
        unhoistableHeaders: new Set([
          'x-amz-meta-file-id',
          'x-amz-meta-expected-bytes',
        ]),
      },
    );
  }

  async createDownloadUrl(input: {
    bucket: string;
    objectKey: string;
    downloadName: string;
    expiresInSeconds: number;
  }): Promise<string> {
    this.ensureConfigured();
    const safeName = input.downloadName.replace(
      /[\r\n"\\]/g,
      '_',
    );
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(safeName)}`,
        ResponseContentType:
          'application/octet-stream',
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  async headObject(
    bucket: string,
    objectKey: string,
  ): Promise<StorageObjectHead | null> {
    this.ensureConfigured();
    try {
      const result = await this.client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
      );
      return {
        contentLength: Number(
          result.ContentLength ?? 0,
        ),
        contentType: result.ContentType ?? null,
        etag:
          result.ETag?.replace(/^"|"$/g, '') ??
          null,
        metadata: result.Metadata ?? {},
      };
    } catch (error: any) {
      if (
        error?.$metadata?.httpStatusCode ===
          404 ||
        error?.name === 'NotFound' ||
        error?.name === 'NoSuchKey'
      ) {
        return null;
      }
      throw error;
    }
  }

  async copyObject(
    bucket: string,
    sourceKey: string,
    destinationKey: string,
  ): Promise<void> {
    this.ensureConfigured();
    const encodedSource = sourceKey
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    await this.client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        Key: destinationKey,
        CopySource: `${bucket}/${encodedSource}`,
        MetadataDirective: 'COPY',
      }),
    );
  }

  async getObjectStream(
    bucket: string,
    objectKey: string,
  ): Promise<StorageObjectStream> {
    this.ensureConfigured();
    const result = await this.client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
    if (!(result.Body instanceof Readable)) {
      throw new ServiceUnavailableException(
        'Providerul de storage nu a returnat un stream valid.',
      );
    }
    return {
      body: result.Body,
      contentLength: Number(
        result.ContentLength ?? 0,
      ),
      contentType: result.ContentType ?? null,
      etag:
        result.ETag?.replace(/^"|"$/g, '') ??
        null,
      metadata: result.Metadata ?? {},
    };
  }

  async putObjectStream(input: {
    bucket: string;
    objectKey: string;
    body: Readable;
    contentLength: number;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    this.ensureConfigured();
    await this.client.send(
      new PutObjectCommand({
        Bucket: input.bucket,
        Key: input.objectKey,
        Body: input.body,
        ContentLength: input.contentLength,
        ContentType: input.contentType,
        Metadata: input.metadata,
      }),
    );
  }

  async deleteObject(
    bucket: string,
    objectKey: string,
  ): Promise<void> {
    this.ensureConfigured();
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      }),
    );
  }

  async listObjectsPage(input: {
    bucket: string;
    prefix: string;
    continuationToken?: string;
    maxKeys?: number;
  }) {
    this.ensureConfigured();
    const result = await this.client.send(
      new ListObjectsV2Command({
        Bucket: input.bucket,
        Prefix: input.prefix,
        ContinuationToken:
          input.continuationToken,
        MaxKeys: input.maxKeys ?? 500,
      }),
    );
    return {
      objects: (result.Contents ?? [])
        .filter(
          (
            object,
          ): object is typeof object & {
            Key: string;
          } => Boolean(object.Key),
        )
        .map((object) => ({
          objectKey: object.Key,
          sizeBytes: Number(object.Size ?? 0),
          etag:
            object.ETag?.replace(/^"|"$/g, '') ??
            null,
          lastModified:
            object.LastModified ?? null,
        })),
      nextContinuationToken:
        result.NextContinuationToken,
    };
  }

  async ping(bucket: string): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      await this.client.send(
        new HeadBucketCommand({ Bucket: bucket }),
      );
      return true;
    } catch {
      return false;
    }
  }

  private ensureConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Storage-ul de fisiere nu este configurat.',
      );
    }
  }

  private isConfigured(): boolean {
    return (
      this.config.get<string>(
        'STORAGE_ENABLED',
        'false',
      ) === 'true' &&
      Boolean(
        this.config.get<string>(
          'STORAGE_S3_ENDPOINT',
        ),
      ) &&
      Boolean(
        this.config.get<string>(
          'STORAGE_S3_BUCKET',
        ),
      ) &&
      Boolean(
        this.config.get<string>(
          'STORAGE_S3_ACCESS_KEY',
        ),
      ) &&
      Boolean(
        this.config.get<string>(
          'STORAGE_S3_SECRET_KEY',
        ),
      )
    );
  }
}
