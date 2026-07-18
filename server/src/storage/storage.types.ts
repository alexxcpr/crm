import type { Readable } from 'stream';

export interface StorageObjectHead {
  contentLength: number;
  contentType: string | null;
  etag: string | null;
  metadata: Record<string, string>;
}

export interface StorageObjectStream extends StorageObjectHead {
  body: Readable;
}

export interface StorageObjectSummary {
  objectKey: string;
  sizeBytes: number;
  etag: string | null;
  lastModified: Date | null;
}

export interface StorageProvider {
  createUploadUrl(input: {
    bucket: string;
    objectKey: string;
    contentType: string;
    fileId: string;
    expectedBytes: number;
    expiresInSeconds: number;
  }): Promise<string>;
  createDownloadUrl(input: {
    bucket: string;
    objectKey: string;
    downloadName: string;
    expiresInSeconds: number;
  }): Promise<string>;
  headObject(
    bucket: string,
    objectKey: string,
  ): Promise<StorageObjectHead | null>;
  copyObject(
    bucket: string,
    sourceKey: string,
    destinationKey: string,
  ): Promise<void>;
  getObjectStream(
    bucket: string,
    objectKey: string,
  ): Promise<StorageObjectStream>;
  putObjectStream(input: {
    bucket: string;
    objectKey: string;
    body: Readable;
    contentLength: number;
    contentType: string;
    metadata?: Record<string, string>;
  }): Promise<void>;
  deleteObject(
    bucket: string,
    objectKey: string,
  ): Promise<void>;
  listObjectsPage(input: {
    bucket: string;
    prefix: string;
    continuationToken?: string;
    maxKeys?: number;
  }): Promise<{
    objects: StorageObjectSummary[];
    nextContinuationToken?: string;
  }>;
  ping(bucket: string): Promise<boolean>;
}

export interface StorageUsageState {
  includedGb: number;
  extraUnits: number;
  quotaGb: number;
  quotaBytes: number;
  usedBytes: number;
  reservedBytes: number;
  remainingBytes: number;
  percentage: number;
  overQuota: boolean;
}
