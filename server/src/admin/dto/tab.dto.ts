import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RelatedCollectionConfigDto {
  @IsUUID()
  id_relation_field: string;

  @IsIn(['table', 'cards'])
  default_view: 'table' | 'cards';

  @IsBoolean()
  allow_table: boolean;

  @IsBoolean()
  allow_cards: boolean;

  @ValidateIf((dto) => dto.allow_cards)
  @IsUUID()
  card_title_field_id?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  card_field_ids?: string[];

  @IsInt()
  @Min(1)
  @Max(100)
  page_size: number;

  @IsString()
  @MaxLength(255)
  default_sort: string;

  @IsBoolean()
  allow_create: boolean;

  @IsBoolean()
  allow_update: boolean;

  @IsBoolean()
  allow_delete: boolean;

  @IsIn(['none', 'multi_file'])
  quick_add_mode: 'none' | 'multi_file';

  @ValidateIf((dto) => dto.quick_add_mode === 'multi_file')
  @IsUUID()
  id_quick_add_file_field?: string;
}

export class CreateTabDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]{1,50}$/, {
    message: 'Slug-ul poate contine doar litere mici, cifre, _ si trebuie sa inceapa cu o litera.',
  })
  slug: string;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @IsBoolean()
  is_system?: boolean;

  @IsIn(['fields', 'related_collection'])
  content_type: 'fields' | 'related_collection' = 'fields';

  @ValidateIf((dto) => dto.content_type === 'related_collection')
  @ValidateNested()
  @Type(() => RelatedCollectionConfigDto)
  related_collection?: RelatedCollectionConfigDto;
}

export class UpdateTabDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z][a-z0-9_]{1,50}$/, {
    message: 'Slug-ul poate contine doar litere mici, cifre, _ si trebuie sa inceapa cu o litera.',
  })
  slug?: string;

  @IsOptional()
  @IsInt()
  rank?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => RelatedCollectionConfigDto)
  related_collection?: RelatedCollectionConfigDto;
}
