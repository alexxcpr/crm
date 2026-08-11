import { Module } from '@nestjs/common';
import { RelationDisplayFieldService } from './relation-display-field.service';

@Module({
  providers: [RelationDisplayFieldService],
  exports: [RelationDisplayFieldService],
})
export class RelationsModule {}
