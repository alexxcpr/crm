import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export const MENU_LINK_TYPES = [
  'entity_list',
  'entity_create',
  'entity_record',
  'dashboard',
  'internal_route',
  'external_url',
] as const;

export type MenuLinkType = typeof MENU_LINK_TYPES[number];

export class MenuDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rank?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class MenuItemDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  rank?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  open_link: string;

  @IsIn(MENU_LINK_TYPES)
  link_type: MenuLinkType;

  @IsOptional()
  @IsUUID()
  id_entity?: string;

  @IsOptional()
  @IsUUID()
  record_id?: string;

  @IsOptional()
  @IsUUID()
  id_ui_dashboard?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
