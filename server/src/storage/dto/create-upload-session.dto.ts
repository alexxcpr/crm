import {
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateUploadSessionDto {
  @IsUUID()
  fieldId: string;

  @IsOptional()
  @IsUUID()
  recordId?: string;

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
