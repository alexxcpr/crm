import { Module } from '@nestjs/common';
import { StorageModule } from 'src/storage/storage.module';
import { DocumentRuntimeService } from './document-runtime.service';
import { WordDocumentAdapter } from './word-document.adapter';

@Module({
  imports: [StorageModule],
  providers: [
    WordDocumentAdapter,
    DocumentRuntimeService,
  ],
  exports: [DocumentRuntimeService],
})
export class DocumentsModule {}
