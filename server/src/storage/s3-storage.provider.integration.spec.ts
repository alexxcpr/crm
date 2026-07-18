import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { S3StorageProvider } from './s3-storage.provider';

const integration =
  process.env.STORAGE_INTEGRATION_TESTS === 'true'
    ? describe
    : describe.skip;

integration('S3StorageProvider (MinIO)', () => {
  const bucket =
    process.env.STORAGE_S3_BUCKET ||
    'moduvis-development';
  const prefix = `integration-tests/${randomUUID()}`;
  const temporaryKey = `${prefix}/temporary`;
  const finalKey = `${prefix}/final`;
  const body = Buffer.from(
    'moduvis-storage-integration',
  );
  let provider: S3StorageProvider;

  beforeAll(() => {
    provider = new S3StorageProvider(
      new ConfigService(),
    );
  });

  afterAll(async () => {
    await Promise.allSettled([
      provider.deleteObject(bucket, temporaryKey),
      provider.deleteObject(bucket, finalKey),
    ]);
  });

  it('presigneaza upload/download si executa HEAD, COPY, LIST si DELETE', async () => {
    const fileId = randomUUID();
    const uploadUrl =
      await provider.createUploadUrl({
        bucket,
        objectKey: temporaryKey,
        contentType: 'text/plain',
        fileId,
        expectedBytes: body.byteLength,
        expiresInSeconds: 60,
      });
    const upload = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'text/plain',
        'x-amz-meta-file-id': fileId,
        'x-amz-meta-expected-bytes': String(
          body.byteLength,
        ),
      },
      body,
    });
    if (!upload.ok) {
      throw new Error(
        `MinIO PUT HTTP ${upload.status}: ${await upload.text()}`,
      );
    }

    const temporary = await provider.headObject(
      bucket,
      temporaryKey,
    );
    expect(temporary?.contentLength).toBe(
      body.byteLength,
    );

    await provider.copyObject(
      bucket,
      temporaryKey,
      finalKey,
    );
    const page = await provider.listObjectsPage({
      bucket,
      prefix,
    });
    expect(
      page.objects.map(
        (object) => object.objectKey,
      ),
    ).toEqual(
      expect.arrayContaining([
        temporaryKey,
        finalKey,
      ]),
    );

    const downloadUrl =
      await provider.createDownloadUrl({
        bucket,
        objectKey: finalKey,
        downloadName: 'test.txt',
        expiresInSeconds: 60,
      });
    const download = await fetch(downloadUrl);
    expect(download.status).toBe(200);
    expect(
      Buffer.from(await download.arrayBuffer()),
    ).toEqual(body);

    await provider.deleteObject(bucket, finalKey);
    expect(
      await provider.headObject(bucket, finalKey),
    ).toBeNull();
  });
});
