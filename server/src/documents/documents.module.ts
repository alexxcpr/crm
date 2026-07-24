import { Module } from '@nestjs/common';
import { StorageModule } from 'src/storage/storage.module';
import { DocumentRuntimeService } from './document-runtime.service';
import { OfficeConversionService } from './office-conversion.service';
import { PdfDocumentAdapter } from './pdf-document.adapter';
import { WordDocumentAdapter } from './word-document.adapter';

@Module({
  imports: [StorageModule],
  providers: [
    OfficeConversionService,
    PdfDocumentAdapter,
    WordDocumentAdapter,
    DocumentRuntimeService,
  ],
  exports: [DocumentRuntimeService],
})
export class DocumentsModule {}
