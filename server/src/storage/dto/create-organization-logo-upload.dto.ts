import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const ORGANIZATION_LOGO_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

export const ORGANIZATION_LOGO_MAX_BYTES =
  10 * 1024 * 1024;

export class CreateOrganizationLogoUploadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsIn(ORGANIZATION_LOGO_MIME_TYPES)
  mimeType: string;

  @IsInt()
  @Min(1)
  @Max(ORGANIZATION_LOGO_MAX_BYTES)
  sizeBytes: number;

  @IsUUID()
  idempotencyKey: string;
}
