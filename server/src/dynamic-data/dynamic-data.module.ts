import { Module } from '@nestjs/common';
import { DynamicDataController } from './dynamic-data.controller';
import { DynamicDataService } from './dynamic-data.service';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { StorageModule } from 'src/storage/storage.module';
import { RelatedDataController } from './related-data.controller';
import { RelatedDataService } from './related-data.service';
import { RelationsModule } from 'src/relations/relations.module';
import { SequenceModule } from 'src/sequences/sequence.module';

@Module({
  imports: [StorageModule, RelationsModule, SequenceModule],
  controllers: [
    RelatedDataController,
    DynamicDataController,
  ],
  providers: [
    DynamicDataService,
    RelatedDataService,
    FilterParserService,
    DynamicValidationService,
  ],
  exports: [DynamicDataService],
})
export class DynamicDataModule {}
