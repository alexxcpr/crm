import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FileStorageService } from './file-storage.service';
import { S3StorageProvider } from './s3-storage.provider';
import { STORAGE_PROVIDER } from './storage.constants';
import { StorageQuotaService } from './storage-quota.service';
import { StorageJobsService } from './storage-jobs.service';

@Module({
  controllers: [FilesController],
  providers: [
    StorageQuotaService,
    FileStorageService,
    S3StorageProvider,
    StorageJobsService,
    {
      provide: STORAGE_PROVIDER,
      useExisting: S3StorageProvider,
    },
  ],
  exports: [
    StorageQuotaService,
    FileStorageService,
    STORAGE_PROVIDER,
  ],
})
export class StorageModule {}
