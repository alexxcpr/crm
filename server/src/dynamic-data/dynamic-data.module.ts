import { Module } from '@nestjs/common';
import { DynamicDataController } from './dynamic-data.controller';
import { DynamicDataService } from './dynamic-data.service';
import { FilterParserService } from './filter-parser.service';
import { DynamicValidationService } from './dynamic-validation.service';
import { StorageModule } from 'src/storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [DynamicDataController],
  providers: [DynamicDataService, FilterParserService, DynamicValidationService],
  exports: [DynamicDataService],
})
export class DynamicDataModule {}
