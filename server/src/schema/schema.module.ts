import { Module } from '@nestjs/common';
import { SchemaController } from './schema.controller';
import { SchemaService } from './schema.service';
import { RelationsModule } from 'src/relations/relations.module';
import { SequenceModule } from 'src/sequences/sequence.module';

@Module({
  imports: [RelationsModule, SequenceModule],
  controllers: [SchemaController],
  providers: [SchemaService],
  exports: [SchemaService],
})
export class SchemaModule {}
