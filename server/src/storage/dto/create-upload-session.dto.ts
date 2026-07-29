import {
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RelatedUploadContextDto {
  @IsString()
  @IsNotEmpty()
  parentSlug: string;

  @IsUUID()
  parentId: string;

  @IsString()
  @IsNotEmpty()
  collectionSlug: string;
}

export class CreateUploadSessionDto {
  @IsUUID()
  fieldId: string;

  @IsOptional()
  @IsUUID()
  recordId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RelatedUploadContextDto)
  relatedContext?: RelatedUploadContextDto;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsMimeType()
  mimeType: string;

  @IsInt()
  @Min(1)
  sizeBytes: number;

  @IsUUID()
  idempotencyKey: string;
}
